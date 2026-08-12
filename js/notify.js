/* ================================================================
   CheckCheck — notify.js
   ----------------------------------------------------------------
   Local notifications on Android. Loads AFTER app.js.

   WHAT THIS IS
   Local, not push. The phone's alarm manager holds a list of "wake up
   at this exact time and show this text". No server, no FCM, no cost,
   works with the app fully closed and offline.

   HOW IT WORKS
   Android can't run your JavaScript while the app is closed, so it
   can't ask "is this chore still due?" at 9am. Everything must be
   decided UP FRONT and handed to the OS as fixed dated alarms.

   So we take the opposite approach to the web version's polling loop:
   on every launch, resume, and data change we
       1. cancel every notification we previously scheduled
       2. recompute what should fire over the next HORIZON_DAYS
       3. schedule those as one-off dated alarms
   That keeps them correct as data changes, and self-heals — a stale
   reminder for a chore you already did disappears next time you open
   the app.

   THE TRADE-OFF: if you don't open CheckCheck for HORIZON_DAYS,
   scheduled reminders run out and stop firing until you next open it.
   14 days is the compromise; raise it and you burn more of Android's
   limited alarm slots.

   Opting in is per item: any chore, to-do, habit or task with a
   reminderTime set gets reminders. Blank means silent. That data
   syncs through Firestore, so you can set reminders on your laptop
   and receive them on your phone.
================================================================ */

(function () {
  'use strict';

  var HORIZON_DAYS = 14;   // how far ahead to schedule one-off reminders
  var HABIT_DAYS   = 7;    // habits recur daily, so they'd eat the whole budget
  var MAX_PENDING  = 60;   // Android throttles apps with many alarms; stay well under
  var CHANNEL_ID   = 'checkcheck-reminders';

  var P = (window.Capacitor && window.Capacitor.Plugins) || {};
  var LN = P.LocalNotifications;

  // Web build: expose no-ops so app.js can call these unconditionally.
  if (!window.CC_NATIVE || !LN) {
    window.CCNotify = {
      available: false,
      ensurePermission: function () { return Promise.resolve(false); },
      rescheduleAll: function () { return Promise.resolve(); },
      test: function () { return Promise.resolve(); },
    };
    return;
  }

  /* ── Stable numeric IDs ──────────────────────────────────────────
     LocalNotifications identifies everything by 32-bit int, but our
     records use string ids. Hash the string to a number so the same
     item always maps to the same slot and rescheduling replaces
     rather than duplicates. */
  function hashId(kind, id, seq) {
    var s = kind + ':' + id + ':' + (seq || 0);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h % 2000000000) + 1;
  }

  function parseHM(t) {
    if (!t || typeof t !== 'string' || t.indexOf(':') === -1) return null;
    var p = t.split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return { h: h, m: m };
  }

  function atTime(date, hm) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hm.h, hm.m, 0, 0);
    return d;
  }

  function dayStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function parseDayStr(s) {
    var p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function get(k) {
    try { return (typeof DB !== 'undefined') ? DB.get(k) : []; } catch (e) { return []; }
  }

  /* ── Build the schedule ──────────────────────────────────────────
     Returns a plain array of {id, title, body, at:Date, extra}.
     Pure function of the data — easy to reason about and to test. */
  function buildSchedule() {
    var out = [];
    var now = new Date();
    var horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);

    // ── Chores: due when lastDone + intervalDays has elapsed ──
    get('chores').forEach(function (c) {
      var hm = parseHM(c.reminderTime);
      if (!hm || !c.intervalDays) return;

      // Never done → nudge today. Otherwise the next due date.
      var due = c.lastDone
        ? new Date(c.lastDone + c.intervalDays * 86400000)
        : new Date();

      var fireAt = atTime(due, hm);
      // Already overdue and today's slot has passed → tomorrow, so an
      // overdue chore keeps nudging instead of going silent forever.
      while (fireAt <= now) fireAt = new Date(fireAt.getTime() + 86400000);
      if (fireAt > horizon) return;

      out.push({
        id: hashId('chore', c.id),
        title: (c.emoji || '🧹') + '  ' + c.title,
        body: c.lastDone
          ? 'Due now — last done ' + Math.round((Date.now() - c.lastDone) / 86400000) + ' days ago.'
          : 'Not done yet.',
        at: fireAt,
        extra: { type: 'chore', id: c.id },
      });
    });

    // ── To-dos and tasks: fire on the due date ──
    [['todos', '📌'], ['tasks', '✅']].forEach(function (pair) {
      var key = pair[0], icon = pair[1];
      get(key).forEach(function (t) {
        var hm = parseHM(t.reminderTime);
        if (!hm || t.done || !t.dueDate) return;

        var fireAt = atTime(parseDayStr(t.dueDate), hm);
        // Overdue items roll forward to the next slot rather than vanishing.
        while (fireAt <= now) fireAt = new Date(fireAt.getTime() + 86400000);
        if (fireAt > horizon) return;

        out.push({
          id: hashId(key, t.id),
          title: icon + '  ' + t.title,
          body: t.dueDate < dayStr(now) ? 'Overdue.' : 'Due today.',
          at: fireAt,
          extra: { type: key === 'todos' ? 'todo' : 'task', id: t.id },
        });
      });
    });

    // ── Habits: recurring, but only on target days and only if not
    //    already done. Can't be expressed as an OS repeat rule, so we
    //    lay out each occurrence individually. ──
    get('habits').forEach(function (h) {
      var hm = parseHM(h.reminderTime);
      if (!hm) return;

      // Shorter horizon than everything else on purpose: a daily habit needs
      // one alarm per day, so five habits over 14 days would be 70 slots and
      // would crowd out your chores and due dates. Seven days is plenty given
      // the schedule is rebuilt every time you open the app.
      for (var d = 0; d < HABIT_DAYS; d++) {
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
        var fireAt = atTime(day, hm);
        if (fireAt <= now) continue;

        // Respect the habit's frequency (daily / weekdays / weekends).
        if (typeof isHabitTargetDay === 'function' && !isHabitTargetDay(h, day)) continue;
        // Don't nag about today if it's already ticked off.
        if (d === 0 && typeof isHabitDoneToday === 'function' && isHabitDoneToday(h)) continue;

        out.push({
          id: hashId('habit', h.id, d),
          title: (h.emoji || '⭐') + '  ' + h.name,
          body: h.type === 'bad' ? 'Check in — how did today go?' : 'Time for your daily habit.',
          at: fireAt,
          extra: { type: 'habit', id: h.id },
        });
      }
    });

    // Soonest first, then trim. If something has to be dropped it should
    // be the far-future stuff, which gets rescheduled on the next open.
    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, MAX_PENDING);
  }

  /* ── Permission ──────────────────────────────────────────────────
     Android 13+ needs an explicit runtime grant. Deliberately NOT
     requested on first launch — a permission prompt before the user
     has any reason to care is the fastest way to a permanent "deny".
     Called instead at the moment someone sets a reminder time. */
  var _permChecked = false;
  var _permGranted = false;

  function ensurePermission(force) {
    if (_permChecked && !force) return Promise.resolve(_permGranted);
    return LN.checkPermissions()
      .then(function (res) {
        if (res.display === 'granted') return { display: 'granted' };
        if (res.display === 'denied' && !force) return res;
        return LN.requestPermissions();
      })
      .then(function (res) {
        _permChecked = true;
        _permGranted = res.display === 'granted';
        return _permGranted;
      })
      .catch(function (e) {
        console.warn('[CheckCheck] notification permission failed:', e);
        return false;
      });
  }

  /* ── Reschedule everything ─────────────────────────────────────── */
  var _busy = false;
  var _queued = false;

  function rescheduleAll() {
    if (_busy) { _queued = true; return Promise.resolve(); }
    _busy = true;

    return ensurePermission()
      .then(function (granted) {
        if (!granted) return null;
        // Clear our previous alarms so changed or completed items don't
        // fire stale text. Only touches notifications we scheduled.
        return LN.getPending().then(function (p) {
          var ids = (p.notifications || []).map(function (n) { return { id: n.id }; });
          return ids.length ? LN.cancel({ notifications: ids }) : null;
        });
      })
      .then(function () {
        if (!_permGranted) return null;
        var items = buildSchedule();
        if (!items.length) return null;

        return LN.schedule({
          notifications: items.map(function (it) {
            return {
              id: it.id,
              title: it.title,
              body: it.body,
              schedule: { at: it.at, allowWhileIdle: true },
              channelId: CHANNEL_ID,
              smallIcon: 'ic_stat_checkcheck',
              extra: it.extra,
            };
          }),
        }).then(function () {
          console.log('[CheckCheck] scheduled ' + items.length + ' reminders; next at ' +
            items[0].at.toLocaleString());
        });
      })
      .catch(function (e) {
        console.warn('[CheckCheck] scheduling failed:', e);
      })
      .then(function () {
        _busy = false;
        if (_queued) { _queued = false; return rescheduleAll(); }
      });
  }

  /* ── Tapping a notification opens the right screen ─────────────── */
  LN.addListener('localNotificationActionPerformed', function (action) {
    var extra = action && action.notification && action.notification.extra;
    if (!extra) return;
    try {
      if (extra.type === 'chore' && typeof goToChore === 'function') goToChore(extra.id);
      else if (extra.type === 'habit' && typeof goToHabit === 'function') goToHabit(extra.id);
      else if (extra.type === 'todo' && typeof goToTodo === 'function') goToTodo(extra.id);
      else if (extra.type === 'task' && typeof goToTask === 'function') goToTask(extra.id);
    } catch (e) {
      console.warn('[CheckCheck] deep link failed:', e);
    }
  });

  /* ── Notification channel ────────────────────────────────────────
     Android 8+ groups notifications into user-controllable channels.
     Without one, ours land in a generic "Miscellaneous" bucket the
     user can't tune separately. */
  if (LN.createChannel) {
    LN.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Chore, to-do, task and habit reminders',
      importance: 4,          // HIGH — appears as a heads-up banner
      visibility: 1,          // shown on the lock screen
      vibration: true,
    }).catch(function (e) { console.warn('[CheckCheck] channel failed:', e); });
  }

  /* ── Test helper ─────────────────────────────────────────────────
     Run CCNotify.test() from chrome://inspect to fire one in 10s.
     Use it to prove delivery works before trusting a 9am alarm. */
  function test(seconds) {
    return ensurePermission(true).then(function (granted) {
      if (!granted) { console.warn('[CheckCheck] permission denied'); return; }
      return LN.schedule({
        notifications: [{
          id: 999999,
          title: '✓✓  CheckCheck',
          body: 'Test notification — delivery works.',
          schedule: { at: new Date(Date.now() + (seconds || 10) * 1000), allowWhileIdle: true },
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_checkcheck',
        }],
      }).then(function () {
        console.log('[CheckCheck] test notification in ' + (seconds || 10) + 's — background the app now');
      });
    });
  }

  window.CCNotify = {
    available: true,
    ensurePermission: ensurePermission,
    rescheduleAll: rescheduleAll,
    buildSchedule: buildSchedule,
    test: test,
  };

  // Initial pass, once the app has had a moment to load its data.
  setTimeout(rescheduleAll, 1500);
})();
