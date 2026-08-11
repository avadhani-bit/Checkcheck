/* ================================================================
   CheckCheck — nlp.js
   Natural-language quick add.

   Type:  Call dentist friday !!2
   Get:   title "Call dentist", due this Friday, priority medium.

   Loads AFTER js/app.js. Does not modify app.js — it intercepts the
   quick-add inputs in the capture phase and does the add itself.

   Supported (all must sit at the END of what you type):
     Dates       today · tonight · tomorrow · tmrw · friday · fri ·
                 next friday · next week · next month · this weekend ·
                 in 3 days · in 2 weeks · aug 12 · 12 aug · 8/12
     Priority    !!1 !!2 !!3   or   p1 p2 p3        (1 = high)
     Repeat      every day · every week · every month · daily · weekly · monthly
     Tag         #followup  (work tasks — sets the follow-up tag)

   An optional "on / by / due / @" before a date is swallowed too.
================================================================ */

(function () {
  'use strict';

  // ─── DATE HELPERS ──────────────────────────────────────────────

  function toISO(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function todayDate() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  // Monday = 0 … Sunday = 6
  function isoDow(d) { return (d.getDay() + 6) % 7; }

  // Monday of the week containing d
  function mondayOf(d) { return addDays(d, -isoDow(d)); }

  // Next occurrence of a weekday, today counts as a hit
  function nextWeekday(isoTarget) {
    const t = todayDate();
    const delta = (isoTarget - isoDow(t) + 7) % 7;
    return addDays(t, delta);
  }

  // That weekday in next calendar week (week starts Monday)
  function weekdayNextWeek(isoTarget) {
    return addDays(mondayOf(todayDate()), 7 + isoTarget);
  }

  // Real calendar date, or null (so "2/30" is left alone as plain text)
  function safeDate(y, monthIdx, day) {
    const d = new Date(y, monthIdx, day);
    return (d.getFullYear() === y && d.getMonth() === monthIdx && d.getDate() === day) ? d : null;
  }

  // Month/day with no year → this year, rolled forward if already past
  function monthDay(monthIdx, day) {
    const t = todayDate();
    let d = safeDate(t.getFullYear(), monthIdx, day);
    if (!d) return null;
    if (d < t) d = safeDate(t.getFullYear() + 1, monthIdx, day);
    return d;
  }

  const WEEKDAYS = {
    mon: 0, monday: 0,
    tue: 1, tues: 1, tuesday: 1,
    wed: 2, weds: 2, wednesday: 2,
    thu: 3, thur: 3, thurs: 3, thursday: 3,
    fri: 4, friday: 4,
    sat: 5, saturday: 5,
    sun: 6, sunday: 6,
  };

  const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const DOW_RE   = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
  const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const LEAD     = '(?:\\s+(?:on|by|due|for|@))?'; // optional preposition, swallowed with the date

  // ─── MATCHERS ──────────────────────────────────────────────────
  // Each matcher only ever looks at the END of the string. That is what
  // keeps "Book flight to Sunday market" from losing its Sunday.

  const MATCHERS = [
    // Priority — !!1 / p1  (1 high, 2 medium, 3 low)
    {
      field: 'priority',
      re: /(^|\s)(?:!!\s*([1-3])|p([1-3]))\s*$/i,
      apply: m => ['high', 'medium', 'low'][Number(m[2] || m[3]) - 1],
    },

    // Priority with no space in front — "Fix bug!!1"
    {
      field: 'priority',
      re: /()!!\s*([1-3])\s*$/,
      apply: m => ['high', 'medium', 'low'][Number(m[2]) - 1],
    },

    // Follow-up tag
    {
      field: 'tag',
      re: /(^|\s)#(?:follow-?ups?|fu)\s*$/i,
      apply: () => 'follow-up',
    },

    // Recurrence
    {
      field: 'recurrence',
      re: /(^|\s)(?:every\s+(day|week|month)|(daily|weekly|monthly))\s*$/i,
      apply: m => {
        const v = (m[2] || m[3] || '').toLowerCase();
        if (v === 'day' || v === 'daily') return 'daily';
        if (v === 'week' || v === 'weekly') return 'weekly';
        return 'monthly';
      },
    },

    // today / tonight / tomorrow
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(today|tonight|tomorrow|tmrw|tmw|tom)\\s*$', 'i'),
      apply: m => {
        const w = m[2].toLowerCase();
        return toISO(w === 'today' || w === 'tonight' ? todayDate() : addDays(todayDate(), 1));
      },
    },

    // next week / next month / this weekend / this week
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(next\\s+week|next\\s+month|this\\s+weekend|the\\s+weekend|weekend)\\s*$', 'i'),
      apply: m => {
        const w = m[2].toLowerCase().replace(/\s+/g, ' ');
        if (w === 'next week') return toISO(addDays(mondayOf(todayDate()), 7));
        if (w === 'next month') {
          const t = todayDate();
          const d = new Date(t.getFullYear(), t.getMonth() + 1, t.getDate());
          return toISO(d);
        }
        return toISO(nextWeekday(WEEKDAYS.sat)); // any weekend phrasing → Saturday
      },
    },

    // next friday
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*next\\s+(' + DOW_RE + ')\\s*$', 'i'),
      apply: m => toISO(weekdayNextWeek(WEEKDAYS[m[2].toLowerCase()])),
    },

    // friday
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(' + DOW_RE + ')\\s*$', 'i'),
      apply: m => toISO(nextWeekday(WEEKDAYS[m[2].toLowerCase()])),
    },

    // in 3 days / in 2 weeks / in a month
    {
      field: 'dueDate',
      re: /(^|\s)in\s+(\d{1,3}|a|an)\s*(d|day|days|w|wk|week|weeks|m|mo|month|months)\s*$/i,
      apply: m => {
        const n = /^\d+$/.test(m[2]) ? Number(m[2]) : 1;
        const u = m[3].toLowerCase();
        const t = todayDate();
        if (u[0] === 'd') return toISO(addDays(t, n));
        if (u[0] === 'w') return toISO(addDays(t, n * 7));
        return toISO(new Date(t.getFullYear(), t.getMonth() + n, t.getDate()));
      },
    },

    // aug 12 / august 12th
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(' + MONTH_RE + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*$', 'i'),
      apply: m => {
        const d = monthDay(MONTHS[m[2].toLowerCase()], Number(m[3]));
        return d ? toISO(d) : null;
      },
    },

    // 12 aug / 12th august
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + MONTH_RE + ')\\.?\\s*$', 'i'),
      apply: m => {
        const d = monthDay(MONTHS[m[3].toLowerCase()], Number(m[2]));
        return d ? toISO(d) : null;
      },
    },

    // 8/12 or 8/12/26  (month/day, matching the app's US date display)
    {
      field: 'dueDate',
      re: new RegExp('(^|\\s)' + LEAD + '\\s*(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\s*$', 'i'),
      apply: m => {
        const mo = Number(m[2]) - 1, day = Number(m[3]);
        if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
        if (m[4]) {
          let y = Number(m[4]);
          if (y < 100) y += 2000;
          const d = safeDate(y, mo, day);
          return d ? toISO(d) : null;
        }
        const d = monthDay(mo, day);
        return d ? toISO(d) : null;
      },
    },
  ];

  // ─── PARSER ────────────────────────────────────────────────────

  function parseNL(raw) {
    const out = {
      title: String(raw || '').trim(),
      dueDate: null,
      priority: null,
      recurrence: null,
      tag: null,
      matched: [],   // the chunks we stripped, for the preview chip
      found: false,
    };

    let s = out.title;
    let guard = 0;
    let changed = true;

    while (changed && guard++ < 12) {
      changed = false;

      for (const M of MATCHERS) {
        if (out[M.field] !== null) continue;      // one value per field, rightmost wins

        const m = s.match(M.re);
        if (!m) continue;

        const value = M.apply(m);
        if (value === null || value === undefined) continue;

        const rest = s.slice(0, m.index + m[1].length).trim();
        if (!rest) continue;                       // never leave an empty title

        out[M.field] = value;
        out.matched.unshift(m[0].trim());
        s = rest;
        changed = true;
        break;
      }
    }

    // A dangling preposition left behind, e.g. "Pay rent by" → "Pay rent"
    s = s.replace(/\s+(on|by|due|for|@)$/i, '').replace(/\s{2,}/g, ' ').trim();
    if (!s) return out;                            // parsed away to nothing → keep original

    // Repeating with no date given → start it today
    if (out.recurrence && !out.dueDate) out.dueDate = toISO(todayDate());

    out.title = s;
    out.found = !!(out.dueDate || out.priority || out.recurrence || out.tag);
    return out;
  }

  // ─── PREVIEW CHIP ──────────────────────────────────────────────

  const PRIORITY_LABEL = { high: '↑ High', medium: '→ Medium', low: '↓ Low' };
  const PRIORITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#94A3B8' };
  const RECUR_LABEL    = { daily: '↻ daily', weekly: '↻ weekly', monthly: '↻ monthly' };

  function prettyDate(iso) {
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    const t = todayDate();
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function injectStyles() {
    if (document.getElementById('nlp-styles')) return;
    const css = `
      #nlp-chip{position:fixed;z-index:8000;display:none;align-items:center;gap:8px;
        max-width:min(420px,92vw);padding:8px 12px;border-radius:10px;
        background:var(--surface,#fff);color:var(--text-1,#111);
        border:1px solid var(--border,#E5E7EB);
        box-shadow:0 8px 24px rgba(0,0,0,.14);
        font:500 .8rem/1.3 Inter,system-ui,sans-serif;pointer-events:none;
        overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      #nlp-chip .nlp-title{font-weight:600;overflow:hidden;text-overflow:ellipsis}
      #nlp-chip .nlp-badge{flex:none;padding:2px 7px;border-radius:6px;font-size:.7rem;
        font-weight:600;background:rgba(99,102,241,.14);color:#4F46E5}
      body.dark #nlp-chip .nlp-badge{background:rgba(99,102,241,.24);color:#A5B4FC}
      #nlp-chip .nlp-dot{width:7px;height:7px;border-radius:50%;flex:none}
    `;
    const el = document.createElement('style');
    el.id = 'nlp-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  let chipEl = null;

  function chip() {
    if (!chipEl) {
      injectStyles();
      chipEl = document.createElement('div');
      chipEl.id = 'nlp-chip';
      document.body.appendChild(chipEl);
    }
    return chipEl;
  }

  function hideChip() { if (chipEl) chipEl.style.display = 'none'; }

  function showChip(input, p) {
    if (!p.found) return hideChip();

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '<span class="nlp-title">' + esc(p.title) + '</span>';
    if (p.dueDate)    html += '<span class="nlp-badge">' + prettyDate(p.dueDate) + '</span>';
    if (p.recurrence) html += '<span class="nlp-badge">' + RECUR_LABEL[p.recurrence] + '</span>';
    if (p.tag)        html += '<span class="nlp-badge">↩ follow-up</span>';
    if (p.priority) {
      html += '<span class="nlp-dot" style="background:' + PRIORITY_COLOR[p.priority] + '"></span>'
            + '<span class="nlp-badge" style="background:transparent;color:inherit;padding-left:0">'
            + PRIORITY_LABEL[p.priority] + '</span>';
    }

    const c = chip();
    c.innerHTML = html;
    c.style.display = 'flex';

    const r = input.getBoundingClientRect();
    const h = c.offsetHeight || 34;
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;             // no room above → sit below
    let left = r.left;
    const w = c.offsetWidth;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    c.style.top = top + 'px';
    c.style.left = left + 'px';
  }

  // ─── QUICK-ADD INTERCEPTION ────────────────────────────────────
  // app.js binds its handlers directly on these elements. Listening on
  // document in the CAPTURE phase lets us run first and stop the event
  // before app.js ever sees it.

  const HINT = 'e.g. Call dentist friday !!2';

  // Which input is this, and what should we create from it?
  function targetInfo(el) {
    if (!el || el.tagName !== 'INPUT') return null;

    if (el.hasAttribute('data-quick-add')) {
      return { kind: 'task', projectId: el.getAttribute('data-quick-add'), rerender: 'work' };
    }
    if (el.id === 'quick-add-input') {
      const pid = (typeof state !== 'undefined' && state.activeProject) ? state.activeProject : null;
      return pid ? { kind: 'task', projectId: pid, rerender: 'work' } : null;
    }
    if (el.id === 'todo-add-input') {
      return { kind: 'todo', projectId: null, rerender: 'todo' };
    }
    return null;
  }

  // Buttons sit next to their input
  function inputForButton(el) {
    if (!el) return null;
    const btn = el.closest ? el.closest('button') : null;
    if (!btn) return null;

    if (btn.hasAttribute('data-quick-add-btn')) {
      return document.querySelector('[data-quick-add="' + btn.getAttribute('data-quick-add-btn') + '"]');
    }
    if (btn.id === 'quick-add-btn')  return document.getElementById('quick-add-input');
    if (btn.id === 'todo-add-btn')   return document.getElementById('todo-add-input');
    return null;
  }

  function commit(input) {
    const info = targetInfo(input);
    if (!info) return false;

    // If app.js somehow didn't load, get out of the way rather than throwing
    if (typeof DB === 'undefined' || typeof uid === 'undefined') return false;

    const raw = input.value.trim();
    if (!raw) return true;                        // swallow empty submits

    const p = parseNL(raw);
    const now = Date.now();

    if (info.kind === 'task') {
      DB.add('tasks', {
        id: uid(),
        projectId: info.projectId,
        title: p.title,
        done: false,
        dueDate: p.dueDate,
        priority: p.priority,
        recurrence: p.recurrence,
        tag: p.tag,
        notes: null,
        completedAt: null,
        createdAt: now,
      });
    } else {
      DB.add('todos', {
        id: uid(),
        title: p.title,
        done: false,
        dueDate: p.dueDate,
        priority: p.priority,
        recurrence: p.recurrence,
        notes: null,
        completedAt: null,
        createdAt: now,
      });
    }

    input.value = '';
    hideChip();

    // Remember how to get focus back after the re-render blows the DOM away
    const selector = input.id
      ? '#' + input.id
      : '[data-quick-add="' + info.projectId + '"]';

    if (info.rerender === 'todo' && typeof renderTodoPanel === 'function') renderTodoPanel();
    else if (typeof render === 'function') render();

    requestAnimationFrame(() => {
      const again = document.querySelector(selector);
      if (again) { again.focus(); applyHint(again); }
    });

    return true;
  }

  function applyHint(el) {
    if (!el || el.dataset.nlpHinted) return;
    if (targetInfo(el)) {
      el.dataset.nlpHinted = '1';
      el.placeholder = HINT;
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideChip(); return; }
    if (e.key !== 'Enter') return;
    if (!targetInfo(e.target)) return;
    if (commit(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  document.addEventListener('click', e => {
    const input = inputForButton(e.target);
    if (!input || !targetInfo(input)) return;
    if (commit(input)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  document.addEventListener('input', e => {
    if (!targetInfo(e.target)) return;
    const v = e.target.value.trim();
    if (!v) return hideChip();
    showChip(e.target, parseNL(v));
  });

  document.addEventListener('focusin', e => applyHint(e.target));
  document.addEventListener('focusout', e => { if (targetInfo(e.target)) hideChip(); });
  window.addEventListener('scroll', hideChip, true);
  window.addEventListener('resize', hideChip);

  // Expose for console poking / future reuse
  window.ccParseNL = parseNL;
})();
