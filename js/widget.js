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

    return { today: rows, generatedAt: Date.now() };
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
