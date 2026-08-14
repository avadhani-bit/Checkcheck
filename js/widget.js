/* ================================================================
   CheckCheck — widget.js
   ----------------------------------------------------------------
   Feeds the Android home screen widgets, and applies ticks made on
   them back into the real data. Loads AFTER app.js.

   THE SHAPE OF THE PROBLEM
   A widget is drawn by the launcher's process. It cannot run this
   JavaScript, cannot read localStorage, cannot reach Firestore. It
   only knows what it was handed the last time the app ran.

   So there are two flows, and they must not be confused:

     PUSH  app -> widget   a flat snapshot, rewritten whenever data
                           changes. Dumb on purpose: pre-formatted
                           strings, no logic for the widget to run.

     DRAIN widget -> app   a queue of ticks made on the home screen.
                           The widget records only "this id, done,
                           at this time" and leaves the meaning to us.

   Why the widget doesn't just update the data itself: completing a
   task can spawn the next occurrence of a recurring task, write
   history, and sync to Firestore. That logic lives in app.js. A Java
   reimplementation would drift out of step, and the two versions
   would eventually disagree about your data. So the widget records
   intent; this file replays it through the app's own code paths.

   On the web every function here is a no-op.
================================================================ */

(function () {
  'use strict';

  var P = (window.Capacitor && window.Capacitor.Plugins) || {};
  var Bridge = P.WidgetBridge;

  if (!window.CC_NATIVE || !Bridge) {
    window.CCWidget = {
      available: false,
      push: function () { return Promise.resolve(); },
      drain: function () { return Promise.resolve(0); },
    };
    return;
  }

  /* ── Build the snapshot ──────────────────────────────────────────
     "Today" means due today or already overdue, still open. Overdue
     items are included deliberately: a widget that hides what you
     missed yesterday is worse than useless.

     Work tasks and personal to-dos are merged into one list, because
     on a home screen you want what's on your plate, not a lecture
     about which tab it lives in. `kind` keeps them distinguishable
     when a tick comes back. */
  function buildSnapshot() {
    var today = ldStr(new Date());
    var projects = DB.get('projects');
    var projName = function (id) {
      var p = projects.find(function (x) { return x.id === id; });
      return p ? p.name : '';
    };

    var rows = [];

    DB.get('tasks').forEach(function (t) {
      if (t.done || !t.dueDate || t.dueDate > today) return;
      rows.push({
        kind: 'tasks',
        id: t.id,
        title: t.title,
        meta: [projName(t.projectId), t.dueDate < today ? 'Overdue' : ''].filter(Boolean).join(' · '),
        priority: t.priority || '',
        done: false,
        overdue: t.dueDate < today,
        due: t.dueDate,
      });
    });

    DB.get('todos').forEach(function (t) {
      if (t.done || !t.dueDate || t.dueDate > today) return;
      rows.push({
        kind: 'todos',
        id: t.id,
        title: t.title,
        meta: t.dueDate < today ? 'To-do · Overdue' : 'To-do',
        priority: '',
        done: false,
        overdue: t.dueDate < today,
        due: t.dueDate,
      });
    });

    // Overdue first, then by due date, then high priority first.
    var rank = { high: 0, medium: 1, low: 2 };
    rows.sort(function (a, b) {
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return (rank[a.priority] === undefined ? 3 : rank[a.priority]) -
             (rank[b.priority] === undefined ? 3 : rank[b.priority]);
    });

    return {
      today: rows,
      chores: buildChores(),
      habits: buildHabits(),
      generatedAt: Date.now(),
    };
  }

  /* ── Chores ──────────────────────────────────────────────────────
     A chore has no done flag, it has a clock: lastDone + intervalDays.
     The widget shows what's due plus what's coming, so it doubles as a
     "what's my week look like" glance rather than only a nag list.
     Status strings mirror the colours used on the app's chore cards. */
  var CHORE_SOON_DAYS = 3;

  function buildChores() {
    var now = Date.now();
    var out = [];

    DB.get('chores').forEach(function (c) {
      if (!c.intervalDays) return;

      var status, meta, due, daysLeft;

      if (!c.lastDone) {
        status = 'due';
        meta = 'Never done';
        due = true;
        daysLeft = -0.5;                     // sorts just after true overdues
      } else {
        var daysSince = (now - c.lastDone) / 86400000;
        daysLeft = c.intervalDays - daysSince;
        if (daysLeft <= -1) {
          status = 'overdue';
          meta = Math.round(-daysLeft) + 'd overdue';
          due = true;
        } else if (daysLeft < 1) {
          status = 'due';
          meta = 'Due today';
          due = true;
        } else if (daysLeft <= CHORE_SOON_DAYS) {
          status = 'soon';
          meta = 'In ' + Math.ceil(daysLeft) + 'd';
          due = false;
        } else {
          status = 'ok';
          meta = 'In ' + Math.ceil(daysLeft) + 'd';
          due = false;
        }
      }

      out.push({
        id: c.id,
        title: c.title,
        emoji: c.emoji || '',
        status: status,
        meta: meta,
        due: due,
        daysLeft: daysLeft,
      });
    });

    // Most overdue first, so the top of the widget is always what matters.
    out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    return out;
  }

  /* ── Habits ──────────────────────────────────────────────────────
     The calendar widgets need the completed days as plain date strings.
     Sending the raw history timestamps would make the Java side redo
     the timezone conversion, and the two would disagree around midnight.
     Only the last ~60 days are sent: enough for a month grid with a
     little slack, and it keeps the snapshot small. */
  function buildHabits() {
    var cutoff = Date.now() - 70 * 86400000;

    return DB.get('habits').map(function (h) {
      var days = [];
      (h.history || []).forEach(function (ts) {
        if (ts < cutoff) return;
        var d = new Date(ts);
        days.push(ldStr(d));                 // local date, same as the app uses
      });

      return {
        id: h.id,
        name: h.name,
        emoji: h.emoji || '',
        targetDays: typeof h.targetDays === 'string' ? h.targetDays : 'daily',
        days: days,
        doneToday: days.indexOf(ldStr(new Date())) !== -1,
        streak: habitStreak(h),
      };
    });
  }

  /* Consecutive target days ending today (or yesterday, if today isn't done
     yet — otherwise the streak would appear to reset every morning). */
  function habitStreak(h) {
    var done = {};
    (h.history || []).forEach(function (ts) { done[ldStr(new Date(ts))] = true; });

    var streak = 0;
    var d = new Date();
    if (!done[ldStr(d)]) d.setDate(d.getDate() - 1);

    for (var i = 0; i < 400; i++) {
      if (typeof isHabitTargetDay === 'function' && !isHabitTargetDay(h, d)) {
        d.setDate(d.getDate() - 1);
        continue;                            // rest days don't break a streak
      }
      if (!done[ldStr(d)]) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  var _pushTimer = null;

  function push() {
    try {
      return Bridge.setSnapshot({ json: JSON.stringify(buildSnapshot()) })
        .catch(function (e) { console.warn('[CheckCheck] widget push failed:', e); });
    } catch (e) {
      console.warn('[CheckCheck] widget push threw:', e);
      return Promise.resolve();
    }
  }

  function pushSoon() {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(push, 800);
  }

  /* ── Apply ticks made on the home screen ─────────────────────────
     Replays each queued tick through the same functions the in-app
     checkboxes use, so recurrence, completedAt and Firestore sync all
     behave identically whether you ticked in the app or on your
     home screen.

     Clearing the queue only after a successful pass means a crash
     mid-drain replays the tick next launch rather than losing it.
     Re-applying "set done to true" to an already-done task is
     harmless, which is what makes that safe. */
  function drain() {
    return Bridge.getActions()
      .then(function (res) {
        var actions = [];
        try { actions = JSON.parse(res.json || '[]'); } catch (e) { actions = []; }
        if (!actions.length) return 0;

        actions.forEach(function (a) {
          try {
            if (a.kind === 'tasks') applyTaskTick(a);
            else if (a.kind === 'todos') applyTodoTick(a);
            else if (a.kind === 'chores') applyChoreTick(a);
            else if (a.kind === 'habits') applyHabitTick(a);
          } catch (e) {
            console.warn('[CheckCheck] could not apply widget action', a, e);
          }
        });

        return Bridge.clearActions().then(function () {
          console.log('[CheckCheck] applied ' + actions.length + ' widget tick(s)');
          if (typeof render === 'function') render();
          return actions.length;
        });
      })
      .catch(function (e) {
        console.warn('[CheckCheck] widget drain failed:', e);
        return 0;
      });
  }

  function applyTaskTick(a) {
    var t = DB.get('tasks').find(function (x) { return x.id === a.id; });
    if (!t) return;                       // deleted in the app since the tick
    if (a.done && !t.done) {
      completeTaskWithRecur(t.id);        // handles recurrence + completedAt
    } else if (!a.done && t.done) {
      DB.update('tasks', t.id, { done: false, completedAt: null });
    }
  }

  function applyTodoTick(a) {
    var t = DB.get('todos').find(function (x) { return x.id === a.id; });
    if (!t) return;
    if (a.done && !t.done) {
      DB.update('todos', t.id, { done: true, completedAt: Date.now() });
      if (t.recurrence && t.recurrence !== 'none') {
        DB.add('todos', {
          id: uid(), title: t.title, done: false,
          dueDate: nextRecurDate(t.dueDate, t.recurrence),
          recurrence: t.recurrence, completedAt: null, createdAt: Date.now(),
        });
      }
    } else if (!a.done && t.done) {
      DB.update('todos', t.id, { done: false, completedAt: null });
    }
  }

  /* Chores are not idempotent the way tasks are: markChoreDone() appends to
     history and resets the clock every time it's called, so replaying the same
     tick twice would record two completions. The queue is only cleared after a
     successful pass, so a replay is possible — guard with the timestamp and
     ignore a tick that predates the chore's current lastDone. */
  function applyChoreTick(a) {
    var c = DB.get('chores').find(function (x) { return x.id === a.id; });
    if (!c) return;
    if (c.lastDone && a.ts && c.lastDone >= a.ts) return;   // already applied
    markChoreDone(c.id);
  }

  /* toggleHabitDate is a toggle, so calling it twice undoes the first call.
     Check the current state and only act if it differs from what was asked. */
  function applyHabitTick(a) {
    var h = DB.get('habits').find(function (x) { return x.id === a.id; });
    if (!h) return;
    var today = ldStr(new Date());
    var isDone = (h.history || []).some(function (ts) { return ldStr(new Date(ts)) === today; });
    if (isDone === !!a.done) return;                        // already in the wanted state
    toggleHabitDate(h.id, today);
  }

  window.CCWidget = {
    available: true,
    push: push,
    pushSoon: pushSoon,
    drain: drain,
    buildSnapshot: buildSnapshot,
  };

  /* Order matters on launch: drain BEFORE pushing. Push first and you
     overwrite the widget with data that doesn't yet include the ticks
     you made on the home screen, so they visibly bounce back. */
  setTimeout(function () {
    drain().then(push);
  }, 1600);
})();
