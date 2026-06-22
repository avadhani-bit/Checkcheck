/* ================================================================
   CheckCheck — app.js
   All state, storage, rendering, and event handling in one file.
   localStorage-backed; swap DB.* methods for Firebase when ready.
================================================================ */

'use strict';

// ─── FIREBASE SYNC ──────────────────────────────────────
const _FB_CONFIG = {
  apiKey:            'AIzaSyBpUUVpBIsuKAx1Tw-cnN4ItXho7IqbMMQ',
  authDomain:        'checkcheck-3d35f.firebaseapp.com',
  projectId:         'checkcheck-3d35f',
  storageBucket:     'checkcheck-3d35f.firebasestorage.app',
  messagingSenderId: '744363444071',
  appId:             '1:744363444071:web:5e72bf03a2771ae83c91c2',
};
firebase.initializeApp(_FB_CONFIG);
const _fbAuth  = firebase.auth();
const _fbStore = firebase.firestore();
let   _fbUser  = null;
const SYNC_KEYS = ['projects','tasks','chores','todos','shopping','habits'];

function fsPush(k, data) {
  if (!_fbUser) return;
  _fbStore.collection('users').doc(_fbUser.uid).collection('data').doc(k)
    .set({ items: data, updatedAt: Date.now() })
    .catch(function(e) { console.warn('Firestore write failed:', k, e); });
}

async function fsPull() {
  if (!_fbUser) return;
  var fsHasData = false;
  for (const _k of SYNC_KEYS) {
    try {
      const snap = await _fbStore.collection('users').doc(_fbUser.uid).collection('data').doc(_k).get();
      if (snap.exists && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
        localStorage.setItem('cc_' + _k, JSON.stringify(snap.data().items));
        fsHasData = true;
      }
    } catch(e) { console.warn('Firestore pull failed:', _k, e); }
  }
  // If Firestore was empty but localStorage has data, push it up (first-time migration)
  if (!fsHasData) {
    for (const _k2 of SYNC_KEYS) {
      const local = JSON.parse(localStorage.getItem('cc_' + _k2) || '[]');
      if (local.length > 0) fsPush(_k2, local);
    }
  }
}
// ─────────────────────────────────────────────────────────────────

// ─── UTILITIES ───────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const fmt = {
  date: d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  dateShort: d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  relativeDay: ms => {
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7)  return `${days} days ago`;
    if (days < 14) return '1 week ago';
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} weeks ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  },
  dueLabel: isoDate => {
    if (!isoDate) return null;
    const due = new Date(isoDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((due - now) / 86400000);
    if (diff < 0)  return { text: `Overdue by ${-diff}d`, cls: 'overdue' };
    if (diff === 0) return { text: 'Due today', cls: 'soon' };
    if (diff === 1) return { text: 'Due tomorrow', cls: 'soon' };
    if (diff <= 7)  return { text: `Due in ${diff}d`, cls: '' };
    return { text: `Due ${fmt.dateShort(isoDate)}`, cls: '' };
  }
};

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── STORAGE (localStorage) ───────────────────────────────────────

const DB = {
  _key: k => `cc_${k}`,
  get: k => {
    try { return JSON.parse(localStorage.getItem(DB._key(k)) || '[]'); }
    catch { return []; }
  },
  set: (k, data) => { localStorage.setItem(DB._key(k), JSON.stringify(data)); fsPush(k, data); },
  add:    (k, item)      => { const d = DB.get(k); d.push(item); DB.set(k, d); },
  update: (k, id, patch) => { DB.set(k, DB.get(k).map(i => i.id === id ? { ...i, ...patch } : i)); },
  remove: (k, id)        => DB.set(k, DB.get(k).filter(i => i.id !== id)),
};

// ─── SEED DATA ────────────────────────────────────────────────────

function seedIfEmpty() {
  if (DB.get('projects').length > 0) return;

  const projects = [
    { id: uid(), name: 'Website Redesign',   color: '#6366F1', createdAt: Date.now() },
    { id: uid(), name: 'Client Onboarding',  color: '#10B981', createdAt: Date.now() },
  ];
  DB.set('projects', projects);

  const now = Date.now();
  const tasks = [
    { id: uid(), projectId: projects[0].id, title: 'Write homepage copy', done: false, dueDate: null, completedAt: null, createdAt: now },
    { id: uid(), projectId: projects[0].id, title: 'Design new logo',     done: true,  dueDate: null, completedAt: now - 2 * 86400000, createdAt: now },
    { id: uid(), projectId: projects[1].id, title: 'Send proposal',       done: false, dueDate: new Date(Date.now() + 86400000).toISOString().slice(0,10), completedAt: null, createdAt: now },
    { id: uid(), projectId: projects[1].id, title: 'Schedule kickoff',    done: true,  dueDate: null, completedAt: now - 5 * 86400000, createdAt: now },
  ];
  DB.set('tasks', tasks);

  DB.set('todos', [
    { id: uid(), title: 'Call dentist', done: false, dueDate: null, completedAt: null, createdAt: now },
    { id: uid(), title: 'Renew car registration', done: false, dueDate: null, completedAt: null, createdAt: now },
  ]);

  DB.set('shopping', [
    { id: uid(), title: 'Eggs',  done: false, createdAt: now },
    { id: uid(), title: 'Milk',  done: false, createdAt: now },
    { id: uid(), title: 'Bread', done: false, createdAt: now },
  ]);

  // Chores with history arrays
  DB.set('chores', [
    { id: uid(), title: 'Change bedsheets', emoji: '🛏️', intervalDays: 14, lastDone: now - 20 * 86400000, history: [now - 20 * 86400000, now - 34 * 86400000], createdAt: now },
    { id: uid(), title: 'Vacuum',           emoji: '🧹', intervalDays: 7,  lastDone: now - 5 * 86400000,  history: [now - 5 * 86400000,  now - 13 * 86400000], createdAt: now },
    { id: uid(), title: 'Clean bathroom',   emoji: '🚿', intervalDays: 7,  lastDone: now - 8 * 86400000,  history: [now - 8 * 86400000,  now - 15 * 86400000], createdAt: now },
    { id: uid(), title: 'Take out trash',   emoji: '🗑️', intervalDays: 3,  lastDone: now - 2 * 86400000,  history: [now - 2 * 86400000,  now - 5 * 86400000],  createdAt: now },
  ]);

  // Sample habits
  const makeHistory = (daysBack, skipDays = []) => {
    const h = [];
    for (let i = daysBack; i >= 0; i--) {
      if (!skipDays.includes(i)) h.push(now - i * 86400000);
    }
    return h;
  };
  DB.set('habits', [
    { id: uid(), name: 'Strength Training', emoji: '💪', color: '#6366F1', targetDays: 'daily', reminderTime: '06:30', history: makeHistory(30, [5,12,19,26]), createdAt: now - 60 * 86400000 },
    { id: uid(), name: 'Floss',             emoji: '🦷', color: '#10B981', targetDays: 'daily', reminderTime: '21:00', history: makeHistory(30, [3,8]),          createdAt: now - 45 * 86400000 },
    { id: uid(), name: 'Read',              emoji: '📚', color: '#F59E0B', targetDays: 'daily', reminderTime: null,    history: makeHistory(30, [6,7,13,14,20,21,27,28]), createdAt: now - 30 * 86400000 },
  ]);
}

// ─── THEME ───────────────────────────────────────────────────────

function applyTimeBasedTheme() {
  const hour = new Date().getHours();
  const isDark = hour < 7 || hour >= 19; // dark before 7am, after 7pm
  document.body.classList.toggle('dark', isDark);
}

// ─── APP STATE ────────────────────────────────────────────────────

const state = {
  mode:          'work',     // 'work' | 'personal'
  activeProject: null,       // project id when in completed-task detail
  activeChore:   null,       // chore id when in chore history detail
  personalTab:   'todo',     // 'todo' | 'shopping' | 'chores' | 'habits'
  activeHabit:   null,       // habit id when in habit detail
  habitGraphView:  'year',   // 'year' | 'month'
  habitGraphYear:  new Date().getFullYear(),
  habitGraphMonth: new Date().getMonth(),
  workView:      'board',    // 'board' | 'reports'
  reportMonth:   new Date().getMonth(),
  reportYear:    new Date().getFullYear(),
  projectMonth:  new Date().getMonth(),
  projectYear:   new Date().getFullYear(),
};

// ─── RENDER ───────────────────────────────────────────────────────

const main = () => document.getElementById('main-content');

function render() {
  if (state.mode === 'work') {
    if (state.activeProject) renderProjectCompleted();
    else if (state.workView === 'reports') renderReports();
    else renderWork();
  } else if (state.mode === 'personal') {
    if (state.activeChore && state.personalTab === 'chores') renderChoreDetail();
    else if (state.activeHabit && state.personalTab === 'habits') renderHabitDetail();
    else renderPersonal();
  }
  syncHeader();
  updateTimerBar();
}

function syncHeader() {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

// ─── GLOBAL TIMER SYSTEM ────────────────────────────────────────
const TIMER_KEY = 'cc_active_timer';
let _globalTimerInterval = null;

function getActiveTimer() {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); } catch { return null; }
}
function setActiveTimer(data) {
  if (data) localStorage.setItem(TIMER_KEY, JSON.stringify(data));
  else localStorage.removeItem(TIMER_KEY);
}

function startChoreTimer(choreId, durationMinutes) {
  setActiveTimer({ choreId, startedAt: Date.now(), durationMs: durationMinutes * 60 * 1000 });
  // Request notification permission for background alert
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  startGlobalTimerTick();
}

function stopChoreTimer() {
  clearInterval(_globalTimerInterval);
  _globalTimerInterval = null;
  setActiveTimer(null);
  updateTimerBar();
}

function startGlobalTimerTick() {
  clearInterval(_globalTimerInterval);
  _globalTimerInterval = setInterval(checkAndTickTimer, 1000);
  checkAndTickTimer();
}

function checkAndTickTimer() {
  const t = getActiveTimer();
  if (!t) { clearInterval(_globalTimerInterval); updateTimerBar(); return; }
  const elapsed = Date.now() - t.startedAt;
  if (elapsed >= t.durationMs) {
    ringGlobalTimer(t.choreId);
  } else {
    updateTimerBar();
  }
}

function ringGlobalTimer(choreId) {
  clearInterval(_globalTimerInterval);
  _globalTimerInterval = null;
  setActiveTimer(null);
  // Mark chore done automatically
  markChoreDone(choreId);
  // Beep
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.4, 0.8].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.35);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.4);
    });
  } catch(e) {}
  // Browser notification (works in background tabs; on iOS PWA, works when app is open)
  if ('Notification' in window && Notification.permission === 'granted') {
    const chore = DB.get('chores').find(c => c.id === choreId);
    new Notification('✓ Timer done!', {
      body: chore ? `"${chore.title}" has been marked complete.` : 'Chore timer complete.',
      icon: 'assets/icon-192.png'
    });
  }
  // Show "done" bar briefly then re-render
  showTimerDoneBar(choreId);
  render();
}

function showTimerDoneBar(choreId) {
  const bar = document.getElementById('global-timer-bar');
  if (!bar) return;
  const chore = DB.get('chores').find(c => c.id === choreId);
  bar.className = 'global-timer-bar done';
  bar.style.display = 'flex';
  bar.innerHTML = `<span>✓ ${chore ? escHtml(chore.title) : 'Timer'} complete — chore marked done!</span>
    <button class="gtb-stop" id="gtb-dismiss">Dismiss</button>`;
  document.getElementById('gtb-dismiss').onclick = () => { bar.style.display = 'none'; bar.className = 'global-timer-bar'; };
  setTimeout(() => { bar.style.display = 'none'; bar.className = 'global-timer-bar'; }, 6000);
}

function updateTimerBar() {
  const bar = document.getElementById('global-timer-bar');
  if (!bar) return;
  const t = getActiveTimer();
  if (!t) { if (!bar.classList.contains('done')) bar.style.display = 'none'; return; }
  const remaining = Math.max(0, Math.ceil((t.durationMs - (Date.now() - t.startedAt)) / 1000));
  const chore = DB.get('chores').find(c => c.id === t.choreId);
  const m = Math.floor(remaining / 60), s = remaining % 60;
  const timeStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const urgent = remaining <= 60;
  bar.className = 'global-timer-bar';
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span class="gtb-icon">⏱</span>
    <span class="gtb-name">${chore ? escHtml(chore.title) : 'Timer'}</span>
    <span class="gtb-time${urgent ? ' urgent' : ''}">${timeStr}</span>
    <button class="gtb-stop" id="gtb-stop">Stop</button>
  `;
  document.getElementById('gtb-stop').onclick = stopChoreTimer;
}

// ─── WORK VIEW (expanded cards with inline tasks) ─────────────────

function renderWork() {
  const projects = DB.get('projects');
  const allTasks = DB.get('tasks');

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Work</div>
      </div>
      <div class="work-tabs">
        <button class="work-tab ${state.workView === 'board' ? 'active' : ''}" data-work-view="board">Tasks</button>
      </div>
      <button class="add-btn" id="btn-add-project">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        New Project
      </button>
    </div>

    ${projects.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📁</div><p>No projects yet.<br>Hit <strong>New Project</strong> to get started.</p></div>`
      : `<div class="project-board">${projects.map(p => expandedProjectCard(p, allTasks)).join('')}</div>
         ${workSummaryHTML(projects, allTasks)}`}
  `;

  document.querySelectorAll('[data-work-view]').forEach(btn => {
    btn.onclick = () => {
      state.workView = btn.dataset.workView;
      if (state.workView === 'reports') renderReports();
      else renderWork();
    };
  });
  document.getElementById('btn-add-project').onclick = () => openProjectModal();

  // Summary week calendar checkboxes (button inside .swc-task)
  document.querySelectorAll('.swc-check').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const card = btn.closest('[data-summary-check]');
      if (!card) return;
      const t = DB.get('tasks').find(x => x.id === card.dataset.summaryCheck);
      if (!t) return;
      DB.update('tasks', t.id, { done: true, completedAt: Date.now() });
      render();
    };
  });

  // Summary week calendar — drag and drop to reschedule
  let _dragTaskId = null;
  document.querySelectorAll('.swc-task[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      _dragTaskId = card.dataset.taskId;
      card.classList.add('swc-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('swc-dragging');
      document.querySelectorAll('.swc-col').forEach(c => c.classList.remove('swc-drop-over'));
    });
  });
  document.querySelectorAll('.swc-col').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.swc-col').forEach(c => c.classList.remove('swc-drop-over'));
      col.classList.add('swc-drop-over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('swc-drop-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('swc-drop-over');
      if (!_dragTaskId) return;
      const colDate = col.dataset.colDate; // 'none' or 'YYYY-MM-DD'
      const newDue = colDate === 'none' ? null : colDate;
      DB.update('tasks', _dragTaskId, { dueDate: newDue });
      _dragTaskId = null;
      render();
    });
  });

  // Task checkboxes
  document.querySelectorAll('[data-check-id]').forEach(el => {
    el.onclick = () => {
      const t = DB.get('tasks').find(x => x.id === el.dataset.checkId);
      if (!t) return;
      const done = !t.done;
      DB.update('tasks', t.id, { done, completedAt: done ? Date.now() : null });
      render();
    };
  });

  // Task delete
  document.querySelectorAll('[data-delete-task]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      if (confirm('Delete this task?')) { DB.remove('tasks', el.dataset.deleteTask); render(); }
    };
  });

  // Task edit
  document.querySelectorAll('[data-edit-task]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const task = DB.get('tasks').find(t => t.id === el.dataset.editTask);
      if (task) openTaskModal(null, task);
    };
  });

  // Open completed view (project name click or "Completed (N)" button)
  document.querySelectorAll('[data-open-project]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      state.activeProject  = el.dataset.openProject;
      state.projectMonth   = new Date().getMonth();
      state.projectYear    = new Date().getFullYear();
      render();
    };
  });

  // Edit project
  document.querySelectorAll('[data-edit-project]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const p = DB.get('projects').find(x => x.id === el.dataset.editProject);
      if (p) openProjectModal(p);
    };
  });

  // Add task (modal)
  document.querySelectorAll('[data-add-task-for]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const p = DB.get('projects').find(x => x.id === el.dataset.addTaskFor);
      if (p) openTaskModal(p);
    };
  });

  // Quick-add inputs (per project)
  document.querySelectorAll('[data-quick-add-btn]').forEach(btn => {
    btn.onclick = () => {
      const pid   = btn.dataset.quickAddBtn;
      const input = document.querySelector(`[data-quick-add="${pid}"]`);
      quickAddTask(pid, input);
    };
  });

  document.querySelectorAll('[data-quick-add]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') quickAddTask(input.dataset.quickAdd, input);
    });
  });

  // ── Drag-and-drop tasks between project cards ──
  let _draggedTaskId = null;
  document.querySelectorAll('[data-task-id]').forEach(row => {
    row.addEventListener('dragstart', e => {
      _draggedTaskId = row.dataset.taskId;
      setTimeout(() => row.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  });
  document.querySelectorAll('.project-expanded-card').forEach(card => {
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!_draggedTaskId) return;
      const titleEl = card.querySelector('[data-open-project]');
      if (!titleEl) return;
      DB.update('tasks', _draggedTaskId, { projectId: titleEl.dataset.openProject });
      _draggedTaskId = null;
      render();
    });
  });
}

function workSummaryHTML(projects, allTasks) {
  const now   = new Date(); now.setHours(0,0,0,0);
  const open  = allTasks.filter(t => !t.done);

  // Build day buckets: no-date, today, tomorrow, +2, +3
  function dayStr(offsetDays) {
    const d = new Date(now); d.setDate(d.getDate() + offsetDays);
    return ldStr(d); // use local date, not UTC
  }
  const todayStr = dayStr(0);
  const cols = [
    { key: 'none',  label: 'No date',  sub: '',          tasks: [] },
    { key: 'today', label: 'Today',    sub: new Date(now).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), tasks: [] },
    { key: 'd1',    label: 'Tomorrow', sub: new Date(now.getTime()+86400000).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), tasks: [] },
    { key: 'd2',    label: dayStr(2),  sub: new Date(now.getTime()+2*86400000).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), tasks: [], useDate:true },
    { key: 'd3',    label: dayStr(3),  sub: new Date(now.getTime()+3*86400000).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), tasks: [], useDate:true },
  ];
  // Fix labels for +2/+3 (use weekday name)
  cols[3].label = new Date(now.getTime()+2*86400000).toLocaleDateString('en-US',{weekday:'long'});
  cols[4].label = new Date(now.getTime()+3*86400000).toLocaleDateString('en-US',{weekday:'long'});

  // Overdue bucket shows in today column
  open.forEach(t => {
    if (!t.dueDate) { cols[0].tasks.push(t); return; }
    const s = t.dueDate; // already a local YYYY-MM-DD string
    if (s <= todayStr)        cols[1].tasks.push(t);
    else if (s === dayStr(1)) cols[2].tasks.push(t);
    else if (s === dayStr(2)) cols[3].tasks.push(t);
    else if (s === dayStr(3)) cols[4].tasks.push(t);
  });

  function taskCard(t) {
    const proj  = projects.find(p => p.id === t.projectId);
    const color = proj ? (proj.color || '#6366F1') : '#6366F1';
    const overdue = t.dueDate && t.dueDate < todayStr;
    return '<div class="swc-task" draggable="true" data-task-id="' + t.id + '" data-summary-check="' + t.id + '">' +
      '<div class="swc-stripe" style="background:' + color + '"></div>' +
      '<div class="swc-body">' +
        '<div class="swc-name' + (overdue ? ' overdue' : '') + '">' + escHtml(t.title) + (overdue ? ' <span class="swc-overdue-tag">overdue</span>' : '') + '</div>' +
        (proj ? '<div class="swc-proj">' + escHtml(proj.name) + '</div>' : '') +
      '</div>' +
      '<button class="swc-check" title="Done">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</button>' +
    '</div>';
  }

  const colsHTML = cols.map((col, ci) => {
    const colDate = col.key === 'none' ? 'none' : dayStr(ci - 1);
    return '<div class="swc-col' + (col.key === 'today' ? ' today' : '') + '" data-col-date="' + colDate + '">' +
      '<div class="swc-col-head">' +
        '<div class="swc-col-title">' + col.label + '</div>' +
        (col.sub ? '<div class="swc-col-sub">' + col.sub + '</div>' : '') +
        '<span class="swc-col-count">' + col.tasks.length + '</span>' +
      '</div>' +
      '<div class="swc-col-tasks">' +
        (col.tasks.length ? col.tasks.map(taskCard).join('') : '<div class="swc-empty">—</div>') +
      '</div>' +
    '</div>'
  }).join('');

  return '<div class="work-summary"><div class="swc-grid">' + colsHTML + '</div></div>';
}

function quickAddTask(projectId, input) {
  const title = input.value.trim();
  if (!title) return;
  DB.add('tasks', { id: uid(), projectId, title, done: false, dueDate: null, completedAt: null, createdAt: Date.now() });
  input.value = '';
  render();
}

function expandedProjectCard(p, allTasks) {
  const tasks     = allTasks.filter(t => t.projectId === p.id);
  const active    = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);
  const color     = p.color || '#6366F1';

  return `
    <div class="project-expanded-card" style="border-top-color:${escHtml(color)}">
      <div class="project-expanded-header">
        <div class="project-expanded-title-row">
          <span class="project-color-dot" style="background:${escHtml(color)}"></span>
          <span class="project-expanded-name" data-open-project="${p.id}">${escHtml(p.name)}</span>
        </div>
        <div class="project-header-actions">
          <button class="task-action-btn" data-edit-project="${p.id}" title="Edit project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="add-task-btn" data-add-task-for="${p.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Task
          </button>
        </div>
      </div>

      <div class="task-list">
        ${active.length === 0
          ? `<div class="empty-state" style="padding:18px 20px;font-size:.85rem">🎉 All tasks done!</div>`
          : active.map(t => workTaskRow(t)).join('')}
      </div>

      <div class="project-expanded-footer">
        <div class="inline-add" style="flex:1;padding:0;border:none;">
          <input class="inline-add-input" data-quick-add="${p.id}" placeholder="Quick add…" />
          <button class="inline-add-btn" data-quick-add-btn="${p.id}">Add</button>
        </div>
      </div>
    </div>
  `;
}

function workTaskRow(t) {
  const due = fmt.dueLabel(t.dueDate);
  return `
    <div class="task-row" draggable="true" data-task-id="${t.id}">
      <div class="task-check" data-check-id="${t.id}"></div>
      <div class="task-body" data-edit-task="${t.id}" style="cursor:pointer">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
        ${t.notes ? `<div class="task-notes-preview">${escHtml(t.notes.slice(0,80))}${t.notes.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      ${t.tag === 'follow-up' ? '<span class="task-tag tag-follow-up">↩ follow-up</span>' : ''}
      <div class="task-actions">
        <button class="task-action-btn" data-edit-task="${t.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn delete" data-delete-task="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ─── PROJECT COMPLETED VIEW ────────────────────────────────────────

function renderProjectCompleted() {
  const p = DB.get('projects').find(x => x.id === state.activeProject);
  if (!p) { state.activeProject = null; return renderWork(); }

  const all    = DB.get('tasks').filter(t => t.projectId === p.id);
  const active = all.filter(t => !t.done);
  const color  = p.color || '#6366F1';

  const month     = state.projectMonth;
  const year      = state.projectYear;
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const completed = all
    .filter(t => {
      if (!t.done || !t.completedAt) return false;
      const d = new Date(t.completedAt);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const now = new Date();
  const isCurrent = month === now.getMonth() && year === now.getFullYear();

  main().innerHTML = `
    <button class="back-btn" id="btn-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      All Projects
    </button>

    <div class="page-header">
      <div class="page-header-left">
        <div class="project-detail-header">
          <span class="project-color-pill" style="background:${escHtml(color)}"></span>
          <div class="page-title">${escHtml(p.name)}</div>
        </div>
        <div class="page-subtitle">${active.length} open · ${completed.length} completed in ${monthName}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="task-action-btn" id="btn-edit-proj" title="Edit project">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="add-btn" id="btn-add-task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Task
        </button>
      </div>
    </div>

    <div class="month-nav" style="margin-bottom:20px">
      <button class="month-nav-btn" id="prev-month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="month-label">${monthName}</span>
      <button class="month-nav-btn" id="next-month" ${isCurrent ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <!-- Open tasks -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Open tasks (${active.length})</span></div>
      <div class="task-list" id="active-list">
        ${active.length === 0
          ? '<div class="empty-state" style="padding:24px 20px"><p>🎉 All tasks done!</p></div>'
          : active.map(t => workTaskRow(t)).join('')}
      </div>
      <div class="inline-add">
        <input class="inline-add-input" id="quick-add-input" placeholder="Quick add task…" />
        <button class="inline-add-btn" id="quick-add-btn">Add</button>
      </div>
    </div>

    <!-- Completed this month -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Completed in ${monthName} (${completed.length})</span>
      </div>
      <div class="task-list">
        ${completed.length === 0
          ? '<div class="empty-state" style="padding:24px 20px;font-size:.875rem;color:var(--text-3)">No tasks completed in ' + monthName + '.</div>'
          : completed.map(completedTaskRow).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-back').onclick    = () => { state.activeProject = null; render(); };
  document.getElementById('btn-add-task').onclick = () => openTaskModal(p);
  document.getElementById('btn-edit-proj').onclick = () => openProjectModal(p);

  document.getElementById('prev-month').onclick = () => {
    if (state.projectMonth === 0) { state.projectMonth = 11; state.projectYear--; }
    else state.projectMonth--;
    renderProjectCompleted();
  };
  document.getElementById('next-month').onclick = () => {
    if (state.projectMonth === 11) { state.projectMonth = 0; state.projectYear++; }
    else state.projectMonth++;
    renderProjectCompleted();
  };

  // Quick add
  const qInput = document.getElementById('quick-add-input');
  const qBtn   = document.getElementById('quick-add-btn');
  const doQuickAdd = () => {
    const title = qInput.value.trim();
    if (!title) return;
    DB.add('tasks', { id: uid(), projectId: p.id, title, done: false, dueDate: null, completedAt: null, createdAt: Date.now() });
    qInput.value = '';
    renderProjectCompleted();
  };
  qBtn.onclick = doQuickAdd;
  qInput.addEventListener('keydown', e => { if (e.key === 'Enter') doQuickAdd(); });

  // Active task check / edit / delete
  document.querySelectorAll('[data-check-id]').forEach(el => {
    el.onclick = () => {
      const t = DB.get('tasks').find(x => x.id === el.dataset.checkId);
      if (!t) return;
      DB.update('tasks', t.id, { done: true, completedAt: Date.now() });
      renderProjectCompleted();
    };
  });
  document.querySelectorAll('[data-edit-task]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const task = DB.get('tasks').find(t => t.id === el.dataset.editTask);
      if (task) openTaskModal(null, task);
    };
  });
  document.querySelectorAll('[data-delete-task]').forEach(el => {
    el.onclick = () => {
      if (confirm('Delete this task?')) { DB.remove('tasks', el.dataset.deleteTask); renderProjectCompleted(); }
    };
  });

  // Un-check completed → move back to active
  document.querySelectorAll('[data-uncheck-id]').forEach(el => {
    el.onclick = () => {
      DB.update('tasks', el.dataset.uncheckId, { done: false, completedAt: null });
      renderProjectCompleted();
    };
  });
}

function completedTaskRow(t) {
  return `
    <div class="task-row done">
      <div class="task-check checked" data-uncheck-id="${t.id}" title="Move back to active" style="cursor:pointer"></div>
      <div class="task-body" data-todo-edit="${t.id}" style="cursor:pointer">
        <div class="task-name">${escHtml(t.title)}</div>
        ${t.completedAt
          ? `<div class="completed-task-date">Completed ${fmt.relativeDay(t.completedAt)} · ${fmt.date(t.completedAt)}</div>`
          : ''}
      </div>
      <div class="task-actions">
        <button class="task-action-btn delete" data-delete-task="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ─── PERSONAL ────────────────────────────────────────────────────

function renderPersonal() {
  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Personal</div>
      </div>
    </div>
    <div class="section-tabs">
      <button class="tab-btn ${state.personalTab === 'todo'     ? 'active' : ''}" data-tab="todo">To-do</button>
      <button class="tab-btn ${state.personalTab === 'shopping' ? 'active' : ''}" data-tab="shopping">Shopping</button>
      <button class="tab-btn ${state.personalTab === 'chores'   ? 'active' : ''}" data-tab="chores">Chores</button>
      <button class="tab-btn ${state.personalTab === 'habits'   ? 'active' : ''}" data-tab="habits">Habits</button>
    </div>
    <div id="personal-panel"></div>
  `;

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.onclick = () => {
      state.personalTab = btn.dataset.tab;
      state.activeChore = null;
      state.activeHabit = null;
      renderPersonal();
    };
  });

  if (state.personalTab === 'todo')     renderTodoPanel();
  if (state.personalTab === 'shopping') renderShoppingPanel();
  if (state.personalTab === 'chores')   renderChoresPanel();
  if (state.personalTab === 'habits')   renderHabitsPanel();
}

// ─── TODO ────────────────────────────────────────────────────────

function renderTodoPanel() {
  const todos  = DB.get('todos');
  const active = todos.filter(t => !t.done);
  const done   = todos.filter(t => t.done);
  const panel  = document.getElementById('personal-panel');

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">To-do list</span>
        <button class="add-btn" id="btn-add-todo" style="padding:6px 12px;font-size:.8rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
      <div class="task-list">
        ${active.length === 0 && done.length === 0
          ? '<div class="empty-state" style="padding:28px 20px"><div class="empty-state-icon">✅</div><p>Nothing to do!</p></div>'
          : active.map(todoRow).join('')}
        ${done.length > 0 ? `
          <div class="section-divider">Done (${done.length})</div>
          ${done.map(todoRow).join('')}
          <div style="padding:10px 20px;">
            <button class="clear-done-btn" id="clear-todos">Clear done</button>
          </div>
        ` : ''}
      </div>
      <div class="inline-add">
        <input class="inline-add-input" id="todo-add-input" placeholder="What do you need to do?" />
        <button class="inline-add-btn" id="todo-add-btn">Add</button>
      </div>
    </div>
  `;

  document.getElementById('btn-add-todo').onclick = () => openTodoModal();

  const addTodo = () => {
    const input = document.getElementById('todo-add-input');
    const title = input.value.trim();
    if (!title) return;
    DB.add('todos', { id: uid(), title, done: false, dueDate: null, recurrence: null, completedAt: null, createdAt: Date.now() });
    input.value = '';
    renderTodoPanel();
    requestAnimationFrame(() => document.getElementById('todo-add-input')?.focus());
  };
  document.getElementById('todo-add-btn').onclick = addTodo;
  document.getElementById('todo-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
  document.getElementById('clear-todos')?.addEventListener('click', () => {
    DB.set('todos', DB.get('todos').filter(t => !t.done));
    renderTodoPanel();
  });

  document.querySelectorAll('[data-todo-check]').forEach(el => {
    el.onclick = () => {
      const t = DB.get('todos').find(x => x.id === el.dataset.todoCheck);
      if (!t) return;
      const nowDone = !t.done;
      DB.update('todos', t.id, { done: nowDone, completedAt: nowDone ? Date.now() : null });
      // If recurring and just completed, create next occurrence
      if (nowDone && t.recurrence && t.recurrence !== 'none') {
        const nextDue = nextRecurDate(t.dueDate, t.recurrence);
        DB.add('todos', {
          id: uid(), title: t.title, done: false,
          dueDate: nextDue, recurrence: t.recurrence,
          completedAt: null, createdAt: Date.now()
        });
      }
      renderTodoPanel();
    };
  });
  document.querySelectorAll('[data-todo-delete]').forEach(el => {
    el.onclick = () => {
      if (confirm('Delete?')) { DB.remove('todos', el.dataset.todoDelete); renderTodoPanel(); }
    };
  });
  document.querySelectorAll('[data-todo-edit]').forEach(el => {
    el.onclick = () => {
      const t = DB.get('todos').find(x => x.id === el.dataset.todoEdit);
      if (t) openTodoModal(t);
    };
  });
}

function nextRecurDate(fromDate, recurrence) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const d = new Date(base);
  if (recurrence === 'daily')   d.setDate(d.getDate() + 1);
  if (recurrence === 'weekly')  d.setDate(d.getDate() + 7);
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const RECUR_LABELS = { daily: '↻ daily', weekly: '↻ weekly', monthly: '↻ monthly' };

function todoRow(t) {
  const due = !t.done ? fmt.dueLabel(t.dueDate) : null;
  return `
    <div class="task-row ${t.done ? 'done' : ''}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-todo-check="${t.id}"></div>
      <div class="task-body" data-todo-edit="${t.id}" style="cursor:pointer">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
      </div>
      ${t.recurrence && !t.done ? `<span class="task-tag tag-recur">${RECUR_LABELS[t.recurrence] || ''}</span>` : ''}
      ${t.done && t.completedAt
        ? `<div class="task-done-date">${fmt.dateShort(t.completedAt)}</div>`
        : ''}
      <div class="task-actions">
        <button class="task-action-btn" data-todo-edit="${t.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn delete" data-todo-delete="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ─── SHOPPING ─────────────────────────────────────────────────────

function renderShoppingPanel() {
  const items  = DB.get('shopping');
  const active = items.filter(i => !i.done);
  const done   = items.filter(i => i.done);
  const panel  = document.getElementById('personal-panel');

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Shopping list</span>
        ${done.length > 0 ? `<button class="clear-done-btn" id="clear-shopping">Clear checked</button>` : ''}
      </div>
      <div class="task-list">
        ${items.length === 0
          ? '<div class="empty-state" style="padding:28px 20px"><div class="empty-state-icon">🛒</div><p>Your list is empty.</p></div>'
          : [...active, ...done].map(shoppingRow).join('')}
      </div>
      <div class="inline-add">
        <input class="inline-add-input" id="shop-add-input" placeholder="Add an item…" />
        <button class="inline-add-btn" id="shop-add-btn">Add</button>
      </div>
    </div>
  `;

  const addShop = () => {
    const input = document.getElementById('shop-add-input');
    const title = input.value.trim();
    if (!title) return;
    DB.add('shopping', { id: uid(), title, done: false, createdAt: Date.now() });
    input.value = '';
    renderShoppingPanel();
    requestAnimationFrame(() => document.getElementById('shop-add-input')?.focus());
  };
  document.getElementById('shop-add-btn').onclick = addShop;
  document.getElementById('shop-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') addShop(); });
  document.getElementById('clear-shopping')?.addEventListener('click', () => {
    DB.set('shopping', DB.get('shopping').filter(i => !i.done));
    renderShoppingPanel();
  });

  document.querySelectorAll('[data-shop-check]').forEach(el => {
    el.onclick = () => {
      const i = DB.get('shopping').find(x => x.id === el.dataset.shopCheck);
      if (!i) return;
      DB.update('shopping', i.id, { done: !i.done });
      renderShoppingPanel();
    };
  });
  document.querySelectorAll('[data-shop-delete]').forEach(el => {
    el.onclick = () => { DB.remove('shopping', el.dataset.shopDelete); renderShoppingPanel(); };
  });
}

function shoppingRow(item) {
  return `
    <div class="shopping-item ${item.done ? 'done' : ''}">
      <div class="shopping-check ${item.done ? 'checked' : ''}" data-shop-check="${item.id}"></div>
      <div class="shopping-name">${escHtml(item.title)}</div>
      <div class="task-actions" style="opacity:1">
        <button class="task-action-btn delete" data-shop-delete="${item.id}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ─── CHORES LIST ─────────────────────────────────────────────────

function renderChoresPanel() {
  const chores = DB.get('chores');
  const panel  = document.getElementById('personal-panel');

  const withStatus = chores.map(c => ({ ...c, _status: choreStatus(c) }));
  withStatus.sort((a, b) => {
    const order = { overdue: 0, soon: 1, ok: 2, never: 3 };
    return (order[a._status.key] ?? 9) - (order[b._status.key] ?? 9);
  });

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Chores</span>
        <button class="add-btn" id="btn-add-chore" style="padding:6px 12px;font-size:.8rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Chore
        </button>
      </div>
      <div class="task-list">
        ${chores.length === 0
          ? '<div class="empty-state" style="padding:28px 20px"><div class="empty-state-icon">🧹</div><p>No chores tracked yet.</p></div>'
          : withStatus.map(choreListRow).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-add-chore').onclick = () => openChoreModal();

  // Mark done
  // Init swipe-to-action on each chore row
  document.querySelectorAll('[data-chore-id]').forEach(rowEl => {
    initChoreSwipe(rowEl, rowEl.dataset.choreId);
  });

  document.querySelectorAll('[data-chore-done]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      markChoreDone(el.dataset.choreDone);
      renderChoresPanel();
    };
  });

  // Click row → detail view
  document.querySelectorAll('[data-chore-detail]').forEach(el => {
    el.onclick = () => {
      state.activeChore = el.dataset.choreDetail;
      render();
    };
  });

  // Timer button on list page
  document.querySelectorAll('[data-chore-timer]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const active = getActiveTimer();
      if (active && active.choreId === el.dataset.choreTimer) {
        stopChoreTimer();
      } else {
        startChoreTimer(el.dataset.choreTimer, parseInt(el.dataset.timerMins));
      }
      renderChoresPanel();
    };
  });

  // Edit
  document.querySelectorAll('[data-chore-edit]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const c = DB.get('chores').find(x => x.id === el.dataset.choreEdit);
      if (c) openChoreModal(c);
    };
  });

  // Delete
  document.querySelectorAll('[data-chore-delete]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      if (confirm('Delete this chore?')) { DB.remove('chores', el.dataset.choreDelete); renderChoresPanel(); }
    };
  });
}

function choreStatus(c) {
  if (!c.lastDone) return { key: 'never', text: 'Never done — tap to mark done', cls: 'never' };
  const daysSince = (Date.now() - c.lastDone) / 86400000;
  const daysOver  = daysSince - c.intervalDays;
  const pct       = daysSince / c.intervalDays;
  const rel       = fmt.relativeDay(c.lastDone);
  if (daysOver >= 5) return { key: 'overdue', cls: 'overdue', text: `${Math.round(daysOver)} days overdue — last done ${rel}` };
  if (daysOver >= 1) {
    const d = Math.round(daysOver);
    return { key: 'late', cls: 'late', text: `${d} day${d !== 1 ? 's' : ''} overdue — last done ${rel}` };
  }
  if (pct >= 0.75) return { key: 'soon', cls: 'soon', text: `Due soon — last done ${rel}` };
  return { key: 'ok', cls: 'ok', text: `Last done ${rel}` };
}

function choreListRow(c) {
  const status = c._status || choreStatus(c);
  const colors = { overdue: '#FEE2E2', late: '#FFEDD5', soon: '#FEF9C3', ok: '#D1FAE5', never: '#F3F4F6' };
  const bg     = colors[status.key] || colors.never;
  const timerBtn = c.timerMinutes
    ? `<button class="chore-timer-list-btn" data-chore-timer="${c.id}" data-timer-mins="${c.timerMinutes}" title="Start ${c.timerMinutes}min timer">⏱${c.timerMinutes}m</button>`
    : '';

  return `
    <div class="chore-row" data-chore-id="${c.id}" style="cursor:pointer;overflow:hidden;position:relative">
      <div class="chore-row-inner" data-chore-detail="${c.id}">
        <div class="chore-icon" style="background:${bg}">${c.emoji || '🔧'}</div>
        <div class="chore-body">
          <div class="chore-name">${escHtml(c.title)}</div>
          <div class="chore-status ${status.cls}">${status.text}</div>
        </div>
        <div class="chore-actions">
          ${timerBtn}
          <button class="chore-done-btn" data-chore-done="${c.id}">✓ Done</button>
          <button class="task-action-btn chore-edit-btn" data-chore-edit="${c.id}" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="task-action-btn delete chore-delete-btn" data-chore-delete="${c.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="chore-swipe-actions" id="swipe-actions-${c.id}">
        <div class="chore-swipe-done" data-chore-done="${c.id}">✓ Done</div>
        <div class="chore-swipe-edit" data-chore-edit="${c.id}">✏️</div>
        <div class="chore-swipe-delete" data-chore-delete="${c.id}">🗑</div>
      </div>
    </div>
  `;
}

function initChoreSwipe(rowEl, id) {
  const inner = rowEl.querySelector('.chore-row-inner');
  const actions = rowEl.querySelector('.chore-swipe-actions');
  if (!inner || !actions) return;
  let startX = 0, startY = 0, dragging = false, revealed = false;
  const THRESHOLD = 55;

  rowEl.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  rowEl.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) && !revealed) { dragging = false; return; }
    if (dx < 0) {
      const clamp = Math.max(-130, dx);
      inner.style.transform = 'translateX(' + clamp + 'px)';
      const pct = Math.min(1, Math.abs(clamp) / THRESHOLD);
      actions.style.opacity = pct;
      actions.style.pointerEvents = 'none';
    } else if (revealed && dx > 0) {
      const clamp = Math.min(0, -130 + dx);
      inner.style.transform = 'translateX(' + clamp + 'px)';
    }
    e.preventDefault();
  }, { passive: false });

  rowEl.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (!revealed && dx < -THRESHOLD) {
      inner.style.transform = 'translateX(-130px)';
      actions.style.opacity = '1';
      actions.style.pointerEvents = 'auto';
      actions.classList.add('visible');
      revealed = true;
      // close on next tap elsewhere
      setTimeout(() => {
        document.addEventListener('touchstart', function close(ev) {
          if (!rowEl.contains(ev.target)) {
            inner.style.transform = '';
            actions.style.opacity = '0';
            actions.classList.remove('visible');
            revealed = false;
          }
          document.removeEventListener('touchstart', close);
        }, { once: true });
      }, 50);
    } else if (revealed && dx > THRESHOLD / 2) {
      inner.style.transform = '';
      actions.style.opacity = '0';
      actions.classList.remove('visible');
      revealed = false;
    } else {
      inner.style.transform = revealed ? 'translateX(-130px)' : '';
      actions.style.opacity = revealed ? '1' : '0';
    }
  });
}

function markChoreDone(id) {
  const chore = DB.get('chores').find(c => c.id === id);
  if (!chore) return;
  // Migrate: if lastDone exists but history doesn't, seed history with lastDone
  const existing = chore.history && chore.history.length > 0
    ? chore.history
    : (chore.lastDone ? [chore.lastDone] : []);
  DB.update('chores', id, { lastDone: Date.now(), history: [...existing, Date.now()] });
}


// ─── MINI CALENDAR HELPER ────────────────────────────────────────

function miniCalendar(history, month, year, choreId) {
  const today       = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay();
  const monthName   = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build a set of done-days for this month
  const doneDays = new Set();
  (history || []).forEach(ts => {
    const d = new Date(ts);
    if (d.getMonth() === month && d.getFullYear() === year) doneDays.add(d.getDate());
  });

  const isFuture = (year > today.getFullYear()) || (year === today.getFullYear() && month > today.getMonth());

  const labels = ['S','M','T','W','T','F','S'].map(l => `<div class="mini-cal-label">${l}</div>`).join('');
  const blanks  = Array(firstDay).fill('<div class="mini-cal-day empty"></div>').join('');
  const days    = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const done    = doneDays.has(d);
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const isFutureDay = isFuture || (year === today.getFullYear() && month === today.getMonth() && d > today.getDate());
    const interactive = choreId && !isFutureDay;
    const attrs = interactive
      ? ` class="mini-cal-day retro-clickable${done ? ' done' : ''}${isToday ? ' today' : ''}" data-retro-chore="${choreId}" data-retro-day="${d}" data-retro-month="${month}" data-retro-year="${year}" data-retro-done="${done ? '1' : '0'}" title="${done ? 'Click to remove this date' : 'Click to log as done'}"`
      : ` class="mini-cal-day${done ? ' done' : ''}${isToday ? ' today' : ''}"`;
    days.push(`<div${attrs}>${d}</div>`);
  }

  return `
    <div class="mini-calendar">
      <div class="mini-cal-month">${monthName}</div>
      <div class="mini-cal-grid">${labels}${blanks}${days.join('')}</div>
    </div>
  `;
}

// ─── CHORE DETAIL / HISTORY ───────────────────────────────────────

function renderChoreDetail() {
  const chore = DB.get('chores').find(c => c.id === state.activeChore);
  if (!chore) { state.activeChore = null; renderPersonal(); return; }

  // History sorted newest first
  const history = ((chore.history && chore.history.length > 0)
    ? chore.history
    : (chore.lastDone ? [chore.lastDone] : [])
  ).slice().sort((a, b) => b - a);

  // ── Stats ──
  let avgInterval = null, onTimeRate = null, trend = null;

  if (history.length >= 2) {
    const intervals = [];
    for (let i = 0; i < history.length - 1; i++) {
      intervals.push((history[i] - history[i + 1]) / 86400000);
    }
    avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    const onTime = intervals.filter(d => d <= chore.intervalDays * 1.15).length;
    onTimeRate = Math.round((onTime / intervals.length) * 100);

    // Trend: compare first half vs second half avg interval
    if (intervals.length >= 4) {
      const half  = Math.floor(intervals.length / 2);
      const older = intervals.slice(half).reduce((a, b) => a + b, 0) / (intervals.length - half);
      const newer = intervals.slice(0, half).reduce((a, b) => a + b, 0) / half;
      trend = newer < older ? 'improving' : newer > older ? 'declining' : 'steady';
    }
  }

  let intervalLabel;
  if (chore.intervalDays < 7) {
    intervalLabel = chore.intervalDays + ' days';
  } else if (chore.intervalDays === 7) {
    intervalLabel = 'weekly';
  } else if (chore.intervalDays === 14) {
    intervalLabel = 'every 2 weeks';
  } else if (chore.intervalDays % 365 === 0) {
    const yrs = chore.intervalDays / 365;
    intervalLabel = yrs === 1 ? 'yearly' : 'every ' + yrs + ' years';
  } else if (chore.intervalDays % 30 === 0) {
    const mos = chore.intervalDays / 30;
    intervalLabel = mos === 1 ? 'monthly' : 'every ' + mos + ' months';
  } else if (chore.intervalDays % 7 === 0) {
    intervalLabel = 'every ' + (chore.intervalDays / 7) + ' weeks';
  } else {
    intervalLabel = 'every ' + chore.intervalDays + ' days';
  }

  const trendIcon  = { improving: '📈', declining: '📉', steady: '➡️' };
  const trendLabel = { improving: 'Improving', declining: 'Needs attention', steady: 'Steady' };

  main().innerHTML = `
    <button class="back-btn" id="btn-back-chore">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Chores
    </button>

    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">${escHtml(chore.emoji || '🔧')} ${escHtml(chore.title)}</div>
        <div class="page-subtitle">Repeats ${intervalLabel}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="task-action-btn" id="edit-chore-btn" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${chore.timerMinutes ? `<button class="timer-btn start" id="chore-timer-btn">⏱ ${chore.timerMinutes}min Timer</button>` : ''}
        <button class="chore-done-btn" id="chore-done-now" style="padding:8px 18px;font-size:.875rem">✓ Mark Done</button>
      </div>
    </div>


    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${history.length}</div>
        <div class="stat-label">Times completed</div>
      </div>
      ${avgInterval !== null ? `
      <div class="stat-card">
        <div class="stat-value">${Math.round(avgInterval)}d</div>
        <div class="stat-label">Avg interval</div>
      </div>` : ''}
      ${onTimeRate !== null ? `
      <div class="stat-card">
        <div class="stat-value">${onTimeRate}%</div>
        <div class="stat-label">On time</div>
      </div>` : ''}
      ${trend ? `
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.4rem">${trendIcon[trend]}</div>
        <div class="stat-label">${trendLabel[trend]}</div>
      </div>` : ''}
    </div>

    <!-- Interval trend bars (last 8 completions) -->
    ${history.length >= 3 ? (() => {
      const recent = history.slice(0, Math.min(8, history.length));
      const pairs  = [];
      for (let i = 0; i < recent.length - 1; i++) {
        pairs.push({ label: fmt.dateShort(recent[i]), days: Math.round((recent[i] - recent[i+1]) / 86400000) });
      }
      const maxDays = Math.max(...pairs.map(p => p.days), chore.intervalDays);
      return `
        <div class="card" style="padding:20px;">
          <div style="font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:14px;">
            Interval between completions
            <span style="font-size:.75rem;color:var(--text-3);text-transform:none;letter-spacing:0;font-weight:400;margin-left:6px;">— target: ${chore.intervalDays}d</span>
          </div>
          ${pairs.map(p => {
            const pct   = Math.min(100, Math.round((p.days / maxDays) * 100));
            const isLate = p.days > chore.intervalDays * 1.15;
            const color  = isLate ? 'var(--red)' : 'var(--green)';
            return `
              <div class="trend-bar-row">
                <div class="trend-bar-label">${p.label}</div>
                <div class="trend-bar-track">
                  <div class="trend-bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                <div style="font-size:.8rem;font-weight:600;color:${isLate ? 'var(--red)' : 'var(--green)'};width:30px;text-align:right;flex-shrink:0">${p.days}d</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    })() : ''}

    <!-- Completion calendar (last 2 months) -->
    <div class="card" style="padding:20px;">
      <div style="font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:16px">Completion calendar</div>
      <div class="mini-cal-pair">
        ${(() => {
          const now2 = new Date();
          const results = [];
          for (let i = 1; i >= 0; i--) {
            let m = now2.getMonth() - i;
            let y = now2.getFullYear();
            if (m < 0) { m += 12; y--; }
            results.push(miniCalendar(history, m, y, chore.id));
          }
          return results.join('');
        })()}
      </div>
    </div>

    <!-- History list -->
    <div class="card">
      <div class="card-header"><span class="card-title">History (${history.length})</span></div>
      ${history.length === 0
        ? `<div class="empty-state" style="padding:28px 20px"><p>Not done yet — hit Mark Done to start tracking!</p></div>`
        : `<div class="task-list">
            ${history.map((ts, i) => {
              const prev = history[i + 1];
              const days = prev ? Math.round((ts - prev) / 86400000) : null;
              const isLate = days !== null && days > chore.intervalDays * 1.15;
              return `
                <div class="chore-history-row">
                  <div class="chore-history-dot"></div>
                  <div class="chore-history-body">
                    <div class="chore-history-date">${fmt.date(ts)}</div>
                    ${days !== null
                      ? `<div class="chore-history-interval ${isLate ? 'late' : 'good'}">${days} days since previous ${isLate ? '— a bit late' : '— on time'}</div>`
                      : `<div class="chore-history-interval">First entry</div>`}
                  </div>
                </div>
              `;
            }).join('')}
          </div>`}
    </div>
  `;

  document.getElementById('btn-back-chore').onclick = () => {
    state.activeChore = null;
    state.personalTab = 'chores';
    renderPersonal();
  };

  document.getElementById('chore-done-now').onclick = () => {
    markChoreDone(state.activeChore);
    renderChoreDetail();
  };

  document.getElementById('edit-chore-btn').onclick = () => {
    const c = DB.get('chores').find(x => x.id === state.activeChore);
    if (c) openChoreModal(c);
  };

  // Timer wiring
  // Detail page timer button — uses global persistent timer
  if (chore.timerMinutes) {
    const timerBtn = document.getElementById('chore-timer-btn');
    if (timerBtn) {
      const active = getActiveTimer();
      const isRunning = active && active.choreId === chore.id;
      timerBtn.textContent = isRunning ? '⏹ Stop Timer' : `⏱ ${chore.timerMinutes}min Timer`;
      timerBtn.classList.toggle('start', !isRunning);
      timerBtn.onclick = () => {
        const cur = getActiveTimer();
        if (cur && cur.choreId === chore.id) stopChoreTimer();
        else startChoreTimer(chore.id, chore.timerMinutes);
        renderChoreDetail();
      };
    }
  }

  // Retrospective calendar: click a day to add/remove from history
  document.querySelectorAll('[data-retro-chore]').forEach(cell => {
    cell.onclick = () => {
      const id    = cell.dataset.retroChore;
      const day   = parseInt(cell.dataset.retroDay);
      const month = parseInt(cell.dataset.retroMonth);
      const year  = parseInt(cell.dataset.retroYear);
      const isDone = cell.dataset.retroDone === '1';
      const c = DB.get('chores').find(x => x.id === id);
      if (!c) return;
      const history = c.history ? [...c.history] : [];
      if (isDone) {
        // Remove all entries that match this calendar day
        const filtered = history.filter(ts => {
          const d = new Date(ts);
          return !(d.getDate() === day && d.getMonth() === month && d.getFullYear() === year);
        });
        const newLastDone = filtered.length ? Math.max(...filtered) : null;
        DB.update('chores', id, { history: filtered, lastDone: newLastDone });
      } else {
        // Add noon of that day
        const ts = new Date(year, month, day, 12, 0, 0).getTime();
        const updated = [...history, ts].sort((a, b) => b - a);
        DB.update('chores', id, { history: updated, lastDone: updated[0] });
      }
      renderChoreDetail();
    };
  });
}


// ─── HABITS ──────────────────────────────────────────────────────

const HABIT_EMOJIS = ['💪','🦷','📚','🏃','🧘','🥗','💧','😴','🎸','✍️','🧠','🌿','🐕','🚴','🏋️'];
const HABIT_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0EA5E9','#14B8A6','#F97316'];

function habitTimesPerWeek(habit) {
  if (typeof habit.targetDays === 'string' && /^\d+x$/.test(habit.targetDays)) {
    return parseInt(habit.targetDays);
  }
  return null;
}

// Return Monday of the ISO week containing `date`
function weekStart(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function countDoneInWeek(doneSet, monDate) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate); d.setDate(d.getDate() + i);
    if (doneSet.has(d.toISOString().slice(0, 10))) count++;
  }
  return count;
}

function habitDoneDays(habit) {
  const done = new Set();
  (habit.history || []).forEach(ts => {
    const d = new Date(ts);
    done.add(d.toISOString().slice(0, 10));
  });
  return done;
}

function isHabitDoneToday(habit) {
  return habitDoneDays(habit).has(new Date().toISOString().slice(0, 10));
}

function isHabitTargetDay(habit, date) {
  const dow = date.getDay();
  if (!habit.targetDays || habit.targetDays === 'daily') return true;
  if (habit.targetDays === 'weekdays') return dow >= 1 && dow <= 5;
  if (habit.targetDays === 'weekends') return dow === 0 || dow === 6;
  if (habitTimesPerWeek(habit)) return true; // Nx habits can be done any day
  if (Array.isArray(habit.targetDays)) return habit.targetDays.includes(dow);
  return true;
}

function habitStreak(habit) {
  const nPerWeek = habitTimesPerWeek(habit);
  if (nPerWeek) {
    // Weekly streak: count consecutive weeks (ending this week) that met the target
    const done = habitDoneDays(habit);
    const today = new Date(); today.setHours(0,0,0,0);
    let ws = weekStart(today);
    let streak = 0;
    for (let w = 0; w < 200; w++) {
      const count = countDoneInWeek(done, ws);
      // For the current week, only count if target met OR we're still in progress (give benefit)
      // Actually: count only completed weeks unless current week already met target
      if (w === 0 && count < nPerWeek) break; // current week not yet met
      if (count >= nPerWeek) { streak++; }
      else break;
      ws = new Date(ws); ws.setDate(ws.getDate() - 7);
    }
    return streak;
  }
  const done = habitDoneDays(habit);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const cur = new Date(today);
  if (!done.has(todayStr)) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (!isHabitTargetDay(habit, cur)) { cur.setDate(cur.getDate() - 1); continue; }
    if (done.has(cur.toISOString().slice(0, 10))) { streak++; cur.setDate(cur.getDate() - 1); }
    else break;
  }
  return streak;
}

function habitLongestStreak(habit) {
  const done = habitDoneDays(habit);
  if (done.size === 0) return 0;
  const dates = [...done].sort();
  let max = 0, cur = 0; let prev = null;
  for (const s of dates) {
    if (!prev) { cur = 1; }
    else { const diff = (new Date(s) - new Date(prev)) / 86400000; cur = diff === 1 ? cur + 1 : 1; }
    if (cur > max) max = cur;
    prev = s;
  }
  return max;
}

function habitCompletionRate(habit, days) {
  const done = habitDoneDays(habit);
  const nPerWeek = habitTimesPerWeek(habit);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (nPerWeek) {
    // Rate = weeks met / total weeks in period
    const weeks = Math.max(1, Math.round(days / 7));
    let ws = weekStart(today);
    let met = 0, total = 0;
    for (let w = 0; w < weeks; w++) {
      // Skip completely future weeks
      const sunDate = new Date(ws); sunDate.setDate(sunDate.getDate() + 6);
      if (ws > today) { ws.setDate(ws.getDate() - 7); continue; }
      total++;
      if (countDoneInWeek(done, ws) >= nPerWeek) met++;
      ws = new Date(ws); ws.setDate(ws.getDate() - 7);
    }
    return total === 0 ? 0 : Math.round((met / total) * 100);
  }
  let target = 0, completed = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (!isHabitTargetDay(habit, d)) continue;
    target++;
    if (done.has(d.toISOString().slice(0, 10))) completed++;
  }
  return target === 0 ? 0 : Math.round((completed / target) * 100);
}


function habitDoneThisMonth(habit) {
  const done  = habitDoneDays(habit);
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const days  = new Date(y, m + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const s = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    if (done.has(s)) count++;
  }
  return count;
}

function habitMonthlyAvg(habit) {
  const history = habit.history || [];
  if (!history.length) return 0;
  const first   = new Date(Math.min(...history));
  const now     = new Date();
  // Count distinct months from first entry to now
  const months  = (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1;
  return Math.round((history.length / Math.max(1, months)) * 10) / 10;
}

function markHabitDone(id) {
  toggleHabitDate(id, new Date().toISOString().slice(0, 10));
}

function toggleHabitDate(id, dateStr) {
  const habit = DB.get('habits').find(h => h.id === id);
  if (!habit) return;
  const done = habitDoneDays(habit);
  if (done.has(dateStr)) {
    const updated = (habit.history || []).filter(ts => new Date(ts).toISOString().slice(0, 10) !== dateStr);
    DB.update('habits', id, { history: updated });
  } else {
    // Store timestamp at noon of that date so it sorts correctly
    const ts = new Date(dateStr + 'T12:00:00').getTime();
    DB.update('habits', id, { history: [...(habit.history || []), ts] });
  }
}

function openHabitImportModal(habitId) {
  const habit = DB.get('habits').find(h => h.id === habitId);
  if (!habit) return;
  openModal('Import Past Dates — ' + habit.name,
    '<div style="margin-bottom:12px;color:var(--text-2);font-size:.85rem">Paste dates one per line. Accepted formats: <code>2025-01-15</code> or <code>Jan 15 2025</code> or <code>15/01/2025</code></div>' +
    '<textarea class="form-input" id="import-dates-ta" rows="12" placeholder="2025-01-01&#10;2025-01-03&#10;2025-01-05&#10;..." style="font-family:monospace;font-size:.82rem;resize:vertical"></textarea>' +
    '<div id="import-preview" style="margin-top:8px;font-size:.78rem;color:var(--text-3)"></div>' +
    '<div class="form-actions"><button class="btn-secondary" id="modal-cancel">Cancel</button>' +
    '<button class="btn-primary" id="modal-save">Import</button></div>'
  );

  const ta = document.getElementById('import-dates-ta');
  const preview = document.getElementById('import-preview');
  const existingDone = habitDoneDays(habit);

  function parseDates(raw) {
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    const valid = [], skipped = [];
    lines.forEach(line => {
      let d = null;
      // Try YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(line)) d = new Date(line + 'T12:00:00');
      // Try MM/DD/YYYY or DD/MM/YYYY — attempt both, pick whichever is valid date in range
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(line)) {
        const parts = line.split('/');
        const attempt = new Date(parts[2] + '-' + parts[0].padStart(2,'0') + '-' + parts[1].padStart(2,'0') + 'T12:00:00');
        if (!isNaN(attempt)) d = attempt;
      }
      // Try natural language via Date.parse
      else { const p = new Date(line); if (!isNaN(p)) d = p; }

      if (d && !isNaN(d)) {
        const s = d.toISOString().slice(0,10);
        if (existingDone.has(s)) skipped.push(s + ' (already logged)');
        else valid.push({ s, ts: new Date(s + 'T12:00:00').getTime() });
      } else {
        skipped.push(line + ' (unrecognized)');
      }
    });
    return { valid, skipped };
  }

  ta.oninput = () => {
    const { valid, skipped } = parseDates(ta.value);
    preview.textContent = valid.length + ' dates to import' + (skipped.length ? ', ' + skipped.length + ' skipped' : '') + '.';
  };

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const { valid } = parseDates(ta.value);
    if (!valid.length) return;
    const newHistory = [...(habit.history || []), ...valid.map(v => v.ts)];
    DB.update('habits', habitId, { history: newHistory });
    closeModal();
    renderHabitDetail();
  };
  ta.focus();
}

function renderHabitsPanel() {
  const habits = DB.get('habits');
  const panel  = document.getElementById('personal-panel');
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const withStatus = habits.map(h => ({
    ...h,
    _doneToday: isHabitDoneToday(h),
    _isTarget:  isHabitTargetDay(h, today),
    _streak:    habitStreak(h),
    _rate30:    habitCompletionRate(h, 30),
  }));
  withStatus.sort((a, b) => {
    const rank = h => (!h._isTarget ? 2 : h._doneToday ? 1 : 0);
    return rank(a) - rank(b);
  });
  const todayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const doneCount = withStatus.filter(h => h._isTarget && h._doneToday).length;
  const targetCount = withStatus.filter(h => h._isTarget).length;

  panel.innerHTML = `
    <div class="habits-header">
      <div class="habits-today-label">${todayLabel}</div>
      <div class="habits-completion-pill">${doneCount} / ${targetCount} today</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">My Habits</span>
        <button class="add-btn" id="btn-add-habit" style="padding:6px 12px;font-size:.8rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>
      ${habits.length === 0
        ? '<div class="empty-state" style="padding:32px 20px"><div class="empty-state-icon">💪</div><p>No habits yet. Add one to start.</p></div>'
        : withStatus.map(habitListRow).join('')}
    </div>
  `;

  document.getElementById('btn-add-habit').onclick = () => {
    requestHabitNotifications();
    openHabitModal();
  };
  document.querySelectorAll('[data-habit-toggle]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); markHabitDone(el.dataset.habitToggle); renderHabitsPanel(); };
  });
  document.querySelectorAll('[data-habit-detail]').forEach(el => {
    el.onclick = () => { state.activeHabit = el.dataset.habitDetail; renderHabitDetail(); };
  });
  document.querySelectorAll('[data-habit-edit]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); const h = DB.get('habits').find(x => x.id === el.dataset.habitEdit); if (h) openHabitModal(h); };
  });
  document.querySelectorAll('[data-habit-delete]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); if (confirm('Delete this habit?')) { DB.remove('habits', el.dataset.habitDelete); renderHabitsPanel(); } };
  });
}

function habitListRow(h) {
  const color = h.color || '#6366F1';
  const done  = h._doneToday;
  const streak = h._streak;
  const rate   = h._rate30;
  const nPerWeek = habitTimesPerWeek(h);
  let metaBadge, metaRight, barPct;
  if (nPerWeek) {
    const today = new Date(); today.setHours(0,0,0,0);
    const ws = weekStart(today);
    const doneSet = habitDoneDays(h);
    const doneThisWeek = countDoneInWeek(doneSet, ws);
    const pct = Math.min(100, Math.round((doneThisWeek / nPerWeek) * 100));
    const weekMet = doneThisWeek >= nPerWeek;
    barPct = pct;
    metaBadge = weekMet
      ? '<span class="habit-streak-badge">' + (streak >= 2 ? '🔥 ' + streak + 'wk streak' : '✓ Week done') + '</span>'
      : '<span class="habit-week-progress">' + doneThisWeek + ' / ' + nPerWeek + ' this week</span>';
    metaRight = '<span class="habit-rate ' + (pct >= 100 ? 'good' : pct >= 50 ? 'mid' : 'low') + '">' + pct + '%</span>';
  } else {
    barPct = rate;
    metaBadge = streak > 0
      ? '<span class="habit-streak-badge">' + (streak >= 7 ? '🔥' : '⚡') + ' ' + streak + 'd streak</span>'
      : '<span class="habit-no-streak">Start your streak!</span>';
    metaRight = '<span class="habit-rate ' + (rate >= 80 ? 'good' : rate >= 50 ? 'mid' : 'low') + '">' + rate + '%</span>';
  }
  const checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  return (
    '<div class="habit-row' + (done ? ' done' : '') + '" data-habit-detail="' + h.id + '" style="cursor:pointer">' +
      '<button class="habit-check' + (done ? ' checked' : '') + '" data-habit-toggle="' + h.id + '"' +
        ' style="' + (done ? 'background:' + color + ';border-color:' + color : 'border-color:' + color) + '"' +
        ' title="' + (done ? 'Undo' : 'Mark done for today') + '">' +
        (done ? checkIcon : '') +
      '</button>' +
      '<div class="habit-emoji-badge" style="background:' + color + '22">' + (h.emoji || '⭐') + '</div>' +
      '<div class="habit-body">' +
        '<div class="habit-name">' + escHtml(h.name) + '</div>' +
        '<div class="habit-meta">' + metaBadge + metaRight + '</div>' +
        '<div class="habit-bar-track"><div class="habit-bar-fill" style="width:' + barPct + '%;background:' + color + '"></div></div>' +
      '</div>' +
      '<div class="task-actions">' +
        '<button class="task-action-btn" data-habit-edit="' + h.id + '" title="Edit">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="task-action-btn delete" data-habit-delete="' + h.id + '" title="Delete">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>'
  );
}

function renderHabitDetail() {
  const habit = DB.get('habits').find(h => h.id === state.activeHabit);
  if (!habit) { state.activeHabit = null; renderPersonal(); return; }
  const color     = habit.color || '#6366F1';
  const streak    = habitStreak(habit);
  const longest   = habitLongestStreak(habit);
  const rate7     = habitCompletionRate(habit, 7);
  const rate30    = habitCompletionRate(habit, 30);
  const rateAll   = habitCompletionRate(habit, 365);
  const doneToday = isHabitDoneToday(habit);
  const total      = (habit.history || []).length;
  const thisMonth  = habitDoneThisMonth(habit);
  const monthlyAvg = habitMonthlyAvg(habit);
  const freqLabel = { daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends',
    '2x': '2× per week', '3x': '3× per week', '4x': '4× per week', '5x': '5× per week', '6x': '6× per week' };
  const freq = freqLabel[habit.targetDays] || 'Every day';
  const nPerWeek = habitTimesPerWeek(habit);

  main().innerHTML = `
    <button class="back-btn" id="btn-back-habit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Habits
    </button>
    <div class="page-header">
      <div class="page-header-left">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="habit-detail-emoji" style="background:${color}22;color:${color}">${habit.emoji || '⭐'}</div>
          <div>
            <div class="page-title">${escHtml(habit.name)}</div>
            <div class="page-subtitle">${freq}${habit.reminderTime ? ' · reminder at ' + habit.reminderTime : ''}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="task-action-btn" id="edit-habit-btn" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-secondary" id="habit-import-btn" style="font-size:.78rem;padding:6px 12px">📥 Import dates</button>
        <button class="habit-mark-btn ${doneToday ? 'done' : ''}" id="habit-done-now"
          style="${doneToday ? 'background:' + color + ';border-color:' + color + ';color:#fff' : 'border-color:' + color + ';color:' + color}">
          ${doneToday ? '✓ Done today' : '○ Mark done today'}
        </button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" style="color:${color}">${streak}</div><div class="stat-label">${streak >= 1 ? '🔥 ' : ''}${nPerWeek ? 'Week streak' : 'Day streak'}</div></div>
      <div class="stat-card"><div class="stat-value">${longest}</div><div class="stat-label">Best streak</div></div>
      <div class="stat-card"><div class="stat-value">${thisMonth}</div><div class="stat-label">This month</div></div>
      <div class="stat-card"><div class="stat-value">${monthlyAvg}</div><div class="stat-label">Monthly avg</div></div>
      <div class="stat-card"><div class="stat-value">${rate30}%</div><div class="stat-label">${nPerWeek ? '4-wk rate' : '30-day rate'}</div></div>
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">All time</div></div>
    </div>
    ${nPerWeek ? (() => {
      const today2 = new Date(); today2.setHours(0,0,0,0);
      const ws2 = weekStart(today2);
      const doneSet2 = habitDoneDays(habit);
      const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const circles = dayNames.map((dn, i) => {
        const d = new Date(ws2); d.setDate(d.getDate() + i);
        const isFuture = d > today2;
        const ds = ldStr(d);
        const isDone = !isFuture && doneSet2.has(ds);
        const isToday = ds === ldStr(today2);
        const cls = 'habit-week-circle' + (isDone ? ' done' : isFuture ? ' future' : '') + (isToday ? ' today' : '');
        const sty = isDone ? 'background:' + color + ';border-color:' + color : isToday ? 'border-color:' + color + ';border-width:2px' : '';
        const dateAttr = isFuture ? '' : ' data-date="' + ds + '"';
        return '<div class="' + cls + '"' + dateAttr + ' style="' + sty + (isFuture ? '' : ';cursor:pointer') + '">' +
          '<span class="habit-week-day-lbl">' + dn + '</span>' +
          (isDone ? checkSvg : '') +
        '</div>';
      }).join('');
      const doneThisWeek2 = countDoneInWeek(doneSet2, ws2);
      const metBanner = doneThisWeek2 >= nPerWeek
        ? '<div style="margin-top:12px;text-align:center;font-size:.82rem;font-weight:600;color:' + color + '">🎉 Week target met!</div>'
        : '';
      return '<div class="card" style="padding:18px 20px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
          '<span style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">This week</span>' +
          '<span style="font-size:.85rem;font-weight:600;color:' + (doneThisWeek2 >= nPerWeek ? color : 'var(--text-2)') + '">' + doneThisWeek2 + ' / ' + nPerWeek + ' done</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:space-between">' + circles + '</div>' +
        metBanner +
      '</div>';
    })() : ''}

    <div class="card" style="padding:18px 20px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center">
        ${[['7 days', rate7], ['30 days', rate30], ['All time', rateAll]].map(([label, rate]) => `
          <div>
            <div style="position:relative;height:5px;background:var(--surface-2);border-radius:99px;margin-bottom:8px">
              <div style="position:absolute;inset-block:0;left:0;width:${rate}%;background:${color};border-radius:99px;transition:width .4s"></div>
            </div>
            <div style="font-size:1.1rem;font-weight:700;color:${color}">${rate}%</div>
            <div style="font-size:.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-top:2px">${label}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${(function() {
      var _view = state.habitGraphView;
      var _yr   = state.habitGraphYear;
      var _mo   = state.habitGraphMonth;
      var isCurrentYear = _view === 'year'  && _yr === new Date().getFullYear();
      var isCurrentMonth= _view === 'month' && _yr === new Date().getFullYear() && _mo === new Date().getMonth();
      var isCurrent = isCurrentYear || isCurrentMonth;
      var yearActive  = _view === 'year'  ? ' active' : '';
      var monthActive = _view === 'month' ? ' active' : '';
      var label = _view === 'year'
        ? String(_yr)
        : new Date(_yr, _mo).toLocaleDateString('en-US', {month:'long', year:'numeric'});
      var graph;
      if (_view === 'year') {
        graph = yearlyGraph(habit, color, _yr);
      } else {
        var prevMo = _mo === 0 ? 11 : _mo - 1;
        var prevYr = _mo === 0 ? _yr - 1 : _yr;
        var nextMo = _mo === 11 ? 0 : _mo + 1;
        var nextYr = _mo === 11 ? _yr + 1 : _yr;
        var fmtMo = function(y, m) { return new Date(y, m).toLocaleDateString('en-US', {month:'short', year:'numeric'}); };
        graph = '<div class="month-3up">' +
          '<div class="month-3up-col month-3up-side">' +
            '<div class="month-3up-label">' + fmtMo(prevYr, prevMo) + '</div>' +
            monthGraph(habit, color, prevYr, prevMo) +
          '</div>' +
          '<div class="month-3up-col">' +
            '<div class="month-3up-label month-3up-label-active">' + fmtMo(_yr, _mo) + '</div>' +
            monthGraph(habit, color, _yr, _mo) +
          '</div>' +
          '<div class="month-3up-col month-3up-side">' +
            '<div class="month-3up-label">' + fmtMo(nextYr, nextMo) + '</div>' +
            monthGraph(habit, color, nextYr, nextMo) +
          '</div>' +
        '</div>';
      }
      var todayBtn = isCurrent ? '' :
        '<button id="hg-today" style="font-size:.72rem;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-2);cursor:pointer;font-family:inherit">Today</button>';
      return '<div class="card" style="padding:18px 20px;overflow-x:auto">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap">' +
          '<div style="display:flex;background:var(--surface-2);border-radius:8px;padding:3px;gap:2px">' +
            '<button class="habit-graph-tab' + yearActive  + '" id="hgt-year">Year</button>' +
            '<button class="habit-graph-tab' + monthActive + '" id="hgt-month">Month</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            todayBtn +
            '<button class="task-action-btn" id="hg-prev" style="font-size:1.1rem;line-height:1;width:28px;height:28px">&#8249;</button>' +
            '<span style="font-size:.85rem;font-weight:600;min-width:110px;text-align:center">' + label + '</span>' +
            '<button class="task-action-btn" id="hg-next" style="font-size:1.1rem;line-height:1;width:28px;height:28px">&#8250;</button>' +
          '</div>' +
        '</div>' +
        graph +
      '</div>';
    })()}

    <div class="card">
      <div class="card-header"><span class="card-title">Recent history</span></div>
      <div class="task-list">
        ${(habit.history || []).length === 0
          ? '<div class="empty-state" style="padding:24px 20px"><p>No completions yet — start today!</p></div>'
          : [...(habit.history || [])].sort((a, b) => b - a).slice(0, 20).map((ts, i, arr) => `
              <div class="chore-history-row">
                <div class="chore-history-dot" style="background:${color}"></div>
                <div class="chore-history-body">
                  <div class="chore-history-date">${fmt.date(ts)}</div>
                  ${i < arr.length - 1
                    ? '<div class="chore-history-interval good">' + Math.round((ts - arr[i+1]) / 86400000) + ' days since previous</div>'
                    : '<div class="chore-history-interval">First recorded</div>'}
                </div>
              </div>`).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-back-habit').onclick = () => { state.activeHabit = null; state.personalTab = 'habits'; renderPersonal(); };
  document.getElementById('edit-habit-btn').onclick = () => { const h = DB.get('habits').find(x => x.id === state.activeHabit); if (h) openHabitModal(h); };
  document.getElementById('habit-done-now').onclick = () => { markHabitDone(state.activeHabit); renderHabitDetail(); };
  document.getElementById('habit-import-btn').onclick = () => openHabitImportModal(state.activeHabit);

  // Graph tab switcher
  const hgtYear  = document.getElementById('hgt-year');
  const hgtMonth = document.getElementById('hgt-month');
  if (hgtYear)  hgtYear.onclick  = () => { state.habitGraphView = 'year';  renderHabitDetail(); };
  if (hgtMonth) hgtMonth.onclick = () => { state.habitGraphView = 'month'; renderHabitDetail(); };

  // Graph prev/next + today
  const hgPrev  = document.getElementById('hg-prev');
  const hgNext  = document.getElementById('hg-next');
  const hgToday = document.getElementById('hg-today');
  if (hgPrev) hgPrev.onclick = () => {
    if (state.habitGraphView === 'year') { state.habitGraphYear--; }
    else { state.habitGraphMonth--; if (state.habitGraphMonth < 0) { state.habitGraphMonth = 11; state.habitGraphYear--; } }
    renderHabitDetail();
  };
  if (hgNext) hgNext.onclick = () => {
    if (state.habitGraphView === 'year') { state.habitGraphYear++; }
    else { state.habitGraphMonth++; if (state.habitGraphMonth > 11) { state.habitGraphMonth = 0; state.habitGraphYear++; } }
    renderHabitDetail();
  };
  if (hgToday) hgToday.onclick = () => {
    state.habitGraphYear  = new Date().getFullYear();
    state.habitGraphMonth = new Date().getMonth();
    renderHabitDetail();
  };

  // Clickable year-graph cells
  document.querySelectorAll('.year-cell[data-date]').forEach(cell => {
    cell.onclick = () => { toggleHabitDate(state.activeHabit, cell.dataset.date); renderHabitDetail(); };
  });

  // Scroll year graph so today is centred in the viewport
  if (state.habitGraphView === 'year') {
    const todayCell = document.getElementById('year-today-cell');
    if (todayCell) {
      const wrap = todayCell.closest('.year-graph-wrap');
      if (wrap) wrap.scrollLeft = todayCell.offsetLeft - wrap.clientWidth / 2;
    }
  }

  // Clickable week-day circles (This Week card)
  document.querySelectorAll('.habit-week-circle[data-date]').forEach(cell => {
    cell.onclick = () => { toggleHabitDate(state.activeHabit, cell.dataset.date); renderHabitDetail(); };
  });

  // Clickable month-calendar cells
  document.querySelectorAll('.month-cal-cell[data-date]').forEach(cell => {
    cell.onclick = () => { toggleHabitDate(state.activeHabit, cell.dataset.date); renderHabitDetail(); };
  });
}

function ldStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function yearlyGraph(habit, color, year) {
  if (!year) year = new Date().getFullYear();
  const done     = habitDoneDays(habit);
  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = ldStr(today);
  // Calendar year: Jan 1 – Dec 31, padded to full Sun→Sat weeks
  const jan1  = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const start = new Date(jan1);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  const weeks = []; const monthLabels = [];
  let cur = new Date(start); let lastMonth = -1;
  for (let w = 0; w < 54; w++) {
    const cells = [];
    // Pre-scan: find if a new month starts mid-column (d > 0)
    // so we can blank out the preceding days of the old month
    let monthBoundaryAt = -1;
    const scan = new Date(cur);
    for (let sd = 0; sd < 7; sd++) {
      if (sd > 0 && scan.getFullYear() === year && scan.getDate() === 1) {
        monthBoundaryAt = sd; break;
      }
      scan.setDate(scan.getDate() + 1);
    }
    for (let d = 0; d < 7; d++) {
      const s = ldStr(cur);
      const outOfYear = cur.getFullYear() !== year;
      // Days before a mid-week month boundary belong to the previous month — hide them
      const prevMonthCell = !outOfYear && monthBoundaryAt > 0 && d < monthBoundaryAt;
      const isFuture  = cur > today;
      const isDone    = !outOfYear && !prevMonthCell && !isFuture && done.has(s);
      const isToday   = s === todayStr;
      const isTarget  = !outOfYear && !prevMonthCell && isHabitTargetDay(habit, cur);
      cells.push({ s, isDone, isFuture, isToday, isTarget, outOfYear: outOfYear || prevMonthCell });
      // Place month label at whatever day-of-week the month starts (not just Sunday)
      if (!outOfYear && cur.getMonth() !== lastMonth) {
        monthLabels.push({ week: w, label: cur.toLocaleDateString('en-US', { month: 'short' }) });
        lastMonth = cur.getMonth();
      }
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(cells);
    if (cur > dec31 && cur.getDay() === 0) break;
  }
  const dayLabels = ['S','M','T','W','T','F','S'];
  const monthRow  = Array(weeks.length).fill('');
  monthLabels.forEach(ml => { monthRow[ml.week] = ml.label; });
  return '<div class="year-graph-wrap">' +
    '<div class="year-graph-months">' + monthRow.map(l => '<span>' + l + '</span>').join('') + '</div>' +
    '<div class="year-graph-body">' +
      '<div class="year-day-labels">' + dayLabels.map((l, i) => '<div class="year-day-lbl">' + (i % 2 === 1 ? l : '') + '</div>').join('') + '</div>' +
      '<div class="year-weeks">' +
        weeks.map(function(cells, wi) {
          var isMonthStart = monthLabels.some(function(ml) { return ml.week === wi; });
          var weekDiv = '<div class="year-week' + (isMonthStart ? ' month-start' : '') + '">';
          return weekDiv + cells.map(c => {
          if (c.outOfYear) return '<div class="year-cell" style="background:transparent"></div>';
          const bg   = c.isFuture ? 'transparent' : c.isDone ? color : c.isTarget ? 'var(--surface-2)' : 'var(--border-light)';
          const ring = c.isToday ? ';outline:2px solid ' + color + ';outline-offset:1px' : '';
          const todayId = c.isToday ? ' id="year-today-cell"' : '';
          if (c.isFuture) return '<div class="year-cell" style="background:' + bg + '"></div>';
          return '<div class="year-cell"' + todayId + ' data-date="' + c.s + '" style="background:' + bg + ring + ';cursor:pointer" title="' + c.s + (c.isDone ? ' ✓' : ' — click to log') + '"></div>';
          }).join('') + '</div>'; }).join('') +
      '</div>' +
    '</div>' +
    '<div class="year-legend"><span>Less</span>' +
      '<div class="year-cell" style="background:var(--surface-2)"></div>' +
      '<div class="year-cell" style="background:' + color + ';opacity:.3"></div>' +
      '<div class="year-cell" style="background:' + color + ';opacity:.6"></div>' +
      '<div class="year-cell" style="background:' + color + '"></div>' +
    '<span>More</span></div>' +
  '</div>';
}

function monthGraph(habit, color, year, month) {
  const done     = habitDoneDays(habit);
  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = ldStr(today);
  const lastDay  = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const dayHdrs  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = '<div class="month-cal-grid">';
  // Header row
  dayHdrs.forEach(h => { html += '<div class="month-cal-hdr">' + h + '</div>'; });
  // Padding before day 1
  for (let i = 0; i < firstDow; i++) html += '<div></div>';
  // Day cells
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const s = ldStr(d);
    const isFuture = d > today;
    const isDone   = !isFuture && done.has(s);
    const isToday  = s === todayStr;
    const isTarget = isHabitTargetDay(habit, d);
    let bg, tc;
    if      (isFuture) { bg = 'transparent';         tc = 'var(--text-3)'; }
    else if (isDone)   { bg = color;                 tc = '#fff'; }
    else if (isTarget) { bg = 'var(--surface-2)';    tc = 'var(--text-1)'; }
    else               { bg = 'var(--border-light)'; tc = 'var(--text-3)'; }
    const ring  = isToday ? ';outline:2px solid ' + color + ';outline-offset:1px' : '';
    const attrs = isFuture ? '' : ' data-date="' + s + '"';
    const cur   = isFuture ? 'default' : 'pointer';
    html += '<div class="month-cal-cell"' + attrs +
      ' style="cursor:' + cur + ';background:' + bg + ';color:' + tc + ring + '"' +
      ' title="' + s + (isDone ? ' ✓' : !isFuture ? ' — click to log' : '') + '">' +
      day + '</div>';
  }
  html += '</div>';
  return html;
}

function openHabitModal(existing) {
  const isEdit = !!existing;
  const curEmoji = existing ? existing.emoji : '💪';
  const curColor = existing ? existing.color : HABIT_COLORS[0];
  const curTarget = existing ? (existing.targetDays || 'daily') : 'daily';
  const curReminder = existing ? (existing.reminderTime || '') : '';

  const emojiDots = HABIT_EMOJIS.map(e =>
    '<div class="color-dot" data-emoji="' + e + '" style="background:var(--surface-2);font-size:1.1rem;display:flex;align-items:center;justify-content:center;' +
    (e === curEmoji ? 'outline:2px solid var(--accent);outline-offset:2px;' : '') + '">' + e + '</div>'
  ).join('');
  const colorDots = HABIT_COLORS.map(c =>
    '<div class="color-dot ' + (c === curColor ? 'selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>'
  ).join('');

  openModal(isEdit ? 'Edit Habit' : 'New Habit',
    '<div class="form-group"><label class="form-label">Habit name</label>' +
    '<input class="form-input" id="habit-name" placeholder="e.g. Strength Training" value="' + escHtml(existing ? existing.name : '') + '" /></div>' +
    '<div class="form-group"><label class="form-label">Icon</label>' +
    '<div class="color-picker" style="flex-wrap:wrap;gap:8px">' + emojiDots + '</div></div>' +
    '<div class="form-group"><label class="form-label">Color</label>' +
    '<div class="color-picker">' + colorDots + '</div></div>' +
    '<div class="form-group"><label class="form-label">Frequency</label>' +
    '<select class="form-input" id="habit-freq">' +
    '<option value="daily"' + (curTarget === 'daily' ? ' selected' : '') + '>Every day</option>' +
    '<option value="weekdays"' + (curTarget === 'weekdays' ? ' selected' : '') + '>Weekdays (Mon–Fri)</option>' +
    '<option value="weekends"' + (curTarget === 'weekends' ? ' selected' : '') + '>Weekends only</option>' +
    '<option disabled>──────────</option>' +
    '<option value="2x"' + (curTarget === '2x' ? ' selected' : '') + '>2× per week</option>' +
    '<option value="3x"' + (curTarget === '3x' ? ' selected' : '') + '>3× per week</option>' +
    '<option value="4x"' + (curTarget === '4x' ? ' selected' : '') + '>4× per week</option>' +
    '<option value="5x"' + (curTarget === '5x' ? ' selected' : '') + '>5× per week</option>' +
    '<option value="6x"' + (curTarget === '6x' ? ' selected' : '') + '>6× per week</option>' +
    '</select></div>' +
    '<div class="form-group"><label class="form-label">Daily reminder <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>' +
    '<input class="form-input" id="habit-reminder" type="time" value="' + curReminder + '" /></div>' +
    (isEdit ? '<div style="margin-top:4px;padding-top:14px;border-top:1px solid var(--border-light)"><button id="delete-habit" style="font-size:.82rem;color:var(--red);font-weight:500;padding:4px 0">Delete this habit</button></div>' : '') +
    '<div class="form-actions"><button class="btn-secondary" id="modal-cancel">Cancel</button>' +
    '<button class="btn-primary" id="modal-save">' + (isEdit ? 'Save changes' : 'Add habit') + '</button></div>'
  );

  let pickedEmoji = curEmoji, pickedColor = curColor;
  document.querySelectorAll('[data-emoji]').forEach(dot => {
    dot.onclick = () => { document.querySelectorAll('[data-emoji]').forEach(d => { d.style.outline = ''; }); dot.style.outline = '2px solid var(--accent)'; dot.style.outlineOffset = '2px'; pickedEmoji = dot.dataset.emoji; };
  });
  document.querySelectorAll('[data-color]').forEach(dot => {
    dot.onclick = () => { document.querySelectorAll('[data-color]').forEach(d => d.classList.remove('selected')); dot.classList.add('selected'); pickedColor = dot.dataset.color; };
  });
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const name = document.getElementById('habit-name').value.trim();
    const targetDays = document.getElementById('habit-freq').value;
    const reminderTime = document.getElementById('habit-reminder').value || null;
    if (!name) { document.getElementById('habit-name').focus(); return; }
    if (isEdit) DB.update('habits', existing.id, { name, emoji: pickedEmoji, color: pickedColor, targetDays, reminderTime });
    else { DB.add('habits', { id: uid(), name, emoji: pickedEmoji, color: pickedColor, targetDays, reminderTime, history: [], createdAt: Date.now() }); }
    closeModal();
    if (state.activeHabit) renderHabitDetail(); else renderHabitsPanel();
  };
  if (isEdit) {
    document.getElementById('delete-habit').onclick = () => {
      if (confirm('Delete this habit?')) { DB.remove('habits', existing.id); closeModal(); state.activeHabit = null; renderPersonal(); }
    };
  }
  document.getElementById('habit-name').focus();
}

let _habitReminderInterval = null;
function scheduleHabitReminders() {
  clearInterval(_habitReminderInterval);
  _habitReminderInterval = setInterval(checkHabitReminders, 60000);
}
function checkHabitReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  DB.get('habits').forEach(h => {
    if (h.reminderTime !== timeStr) return;
    if (!isHabitTargetDay(h, now)) return;
    if (isHabitDoneToday(h)) return;
    new Notification((h.emoji || '⭐') + ' Time for ' + h.name + '!', { body: 'Tap to open CheckCheck.', icon: 'assets/icon-192.png', tag: 'habit-' + h.id });
  });
}
function requestHabitNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(p => { if (p === 'granted') scheduleHabitReminders(); });
  } else if (Notification.permission === 'granted') {
    scheduleHabitReminders();
  }
}

// ─── REPORTS ─────────────────────────────────────────────────────

function renderReports() {
  const month = state.reportMonth;
  const year  = state.reportYear;
  const now   = new Date();

  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const allTasks = DB.get('tasks');
  const projects = DB.get('projects');

  // Tasks completed in this month
  const monthTasks = allTasks.filter(t => {
    if (!t.done || !t.completedAt) return false;
    const d = new Date(t.completedAt);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  // Stats
  const totalDone    = monthTasks.length;
  const uniqueActive = new Set(allTasks.filter(t => !t.done).map(t => t.projectId)).size;

  // Group by project
  const byProject = {};
  monthTasks.forEach(t => {
    if (!byProject[t.projectId]) byProject[t.projectId] = [];
    byProject[t.projectId].push(t);
  });

  const projectSections = projects
    .filter(p => byProject[p.id] && byProject[p.id].length > 0)
    .map(p => {
      const tasks = byProject[p.id].slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      return `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="padding-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:8px;height:8px;border-radius:50%;background:${escHtml(p.color || '#6366F1')};display:inline-block;flex-shrink:0"></span>
              <span class="card-title" style="font-size:.85rem">${escHtml(p.name)}</span>
            </div>
            <span style="font-size:.8rem;font-weight:600;color:var(--text-2)">${tasks.length} completed</span>
          </div>
          <div class="task-list">
            ${tasks.map(t => `
              <div class="task-row done">
                <div class="task-check checked" style="pointer-events:none"></div>
                <div class="task-body">
                  <div class="task-name">${escHtml(t.title)}</div>
                  ${t.completedAt ? `<div class="completed-task-date">${fmt.date(t.completedAt)}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

  const isPrevDisabled = year <= 2024 && month === 0;
  const isNextDisabled = year === now.getFullYear() && month === now.getMonth();

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Reports</div>
        <div class="page-subtitle">Work task completions</div>
      </div>
    </div>

    <!-- Month nav -->
    <div class="month-nav">
      <button class="month-nav-btn" id="prev-month" ${isPrevDisabled ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="month-label">${monthName}</span>
      <button class="month-nav-btn" id="next-month" ${isNextDisabled ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${totalDone}</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${projects.length}</div>
        <div class="stat-label">Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${uniqueActive}</div>
        <div class="stat-label">Active projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${allTasks.filter(t => !t.done).length}</div>
        <div class="stat-label">Open tasks</div>
      </div>
    </div>

    <!-- Task list by project -->
    ${projectSections || `
      <div class="card" style="padding:40px 20px;text-align:center;color:var(--text-3);">
        <div style="font-size:2rem;margin-bottom:12px">📋</div>
        <p style="font-size:.9rem">No tasks completed in ${monthName}.</p>
      </div>
    `}
  `;

  document.getElementById('prev-month').onclick = () => {
    if (state.reportMonth === 0) { state.reportMonth = 11; state.reportYear--; }
    else state.reportMonth--;
    renderReports();
  };
  document.getElementById('next-month').onclick = () => {
    if (state.reportMonth === 11) { state.reportMonth = 0; state.reportYear++; }
    else state.reportMonth++;
    renderReports();
  };
}

// ─── MODALS ───────────────────────────────────────────────────────

const COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#0EA5E9','#14B8A6'];

function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('modal-close').onclick = closeModal; // re-wire every time
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

// ── Project modal ──
function openProjectModal(existing) {
  const isEdit = !!existing;
  const currentColor = existing?.color || COLORS[Math.floor(Math.random() * COLORS.length)];

  openModal(isEdit ? 'Edit Project' : 'New Project', `
    <div class="form-group">
      <label class="form-label">Project name</label>
      <input class="form-input" id="proj-name" placeholder="e.g. Website Redesign" value="${escHtml(existing?.name || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-picker">
        ${COLORS.map(c => `<div class="color-dot ${c === currentColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`).join('')}
      </div>
    </div>
    ${isEdit ? `
    <div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--border-light)">
      <button id="delete-project" style="font-size:.82rem;color:var(--red);font-weight:500;padding:4px 0">
        Delete project and all its tasks
      </button>
    </div>` : ''}
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save changes' : 'Create project'}</button>
    </div>
  `);

  let pickedColor = currentColor;
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.onclick = () => {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      pickedColor = dot.dataset.color;
    };
  });

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const name = document.getElementById('proj-name').value.trim();
    if (!name) { document.getElementById('proj-name').focus(); return; }
    if (isEdit) DB.update('projects', existing.id, { name, color: pickedColor });
    else DB.add('projects', { id: uid(), name, color: pickedColor, createdAt: Date.now() });
    closeModal();
    render();
  };
  document.getElementById('proj-name').focus();

  if (isEdit) {
    document.getElementById('delete-project').onclick = () => {
      if (!confirm('Delete "' + existing.name + '" and all its tasks?')) return;
      DB.remove('projects', existing.id);
      DB.set('tasks', DB.get('tasks').filter(t => t.projectId !== existing.id));
      closeModal();
      state.activeProject = null;
      render();
    };
  }
}

// -- Task modal --
function openTaskModal(project, existing) {
  const isEdit = !!existing;
  const proj   = project || DB.get('projects').find(p => p.id === existing?.projectId);

  openModal(isEdit ? 'Edit Task' : 'Add Task', `
    <div class="form-group">
      <label class="form-label">Task name</label>
      <input class="form-input" id="task-name" placeholder="What needs to be done?" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Due date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional)</span></label>
      <input class="form-input" id="task-due" type="date" value="${existing?.dueDate || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Notes <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional)</span></label>
      <textarea class="form-input" id="task-notes" rows="3" placeholder="Any details, links, context…" style="resize:vertical;min-height:72px">${escHtml(existing?.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Tag</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.88rem;font-weight:400;">
        <input type="checkbox" id="task-followup" ${existing?.tag === 'follow-up' ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer" />
        <span>↩ Mark as follow-up</span>
      </label>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save changes' : 'Add task'}</button>
    </div>
  `);

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const title   = document.getElementById('task-name').value.trim();
    const dueDate = document.getElementById('task-due').value || null;
    const notes   = document.getElementById('task-notes').value.trim() || null;
    const tag     = document.getElementById('task-followup').checked ? 'follow-up' : null;
    if (!title) { document.getElementById('task-name').focus(); return; }
    if (isEdit) DB.update('tasks', existing.id, { title, dueDate, notes, tag });
    else DB.add('tasks', { id: uid(), projectId: proj.id, title, done: false, dueDate, notes, tag, completedAt: null, createdAt: Date.now() });
    closeModal();
    render();
  };
  document.getElementById('task-name').focus();
}

// -- Todo modal --
function openTodoModal(existing) {
  const isEdit = !!existing;
  const recurrenceOptions = ['none','daily','weekly','monthly'];
  const curRecurrence = existing?.recurrence || 'none';
  openModal(isEdit ? 'Edit To-do' : 'New To-do', `
    <div class="form-group">
      <label class="form-label">What needs to be done?</label>
      <input class="form-input" id="todo-name" placeholder="e.g. Call dentist" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Due date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional)</span></label>
      <input class="form-input" id="todo-due" type="date" value="${existing?.dueDate || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Repeats</label>
      <select class="form-input" id="todo-recurrence">
        <option value="none" ${curRecurrence === 'none' ? 'selected' : ''}>Does not repeat</option>
        <option value="daily" ${curRecurrence === 'daily' ? 'selected' : ''}>Daily</option>
        <option value="weekly" ${curRecurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="monthly" ${curRecurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Reminder <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
      <input class="form-input" id="todo-reminder" type="time" value="${existing?.reminderTime || ''}" />
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Add'}</button>
    </div>
  `);

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const title        = document.getElementById('todo-name').value.trim();
    const dueDate      = document.getElementById('todo-due').value || null;
    const recurrence   = document.getElementById('todo-recurrence').value;
    const reminderTime = document.getElementById('todo-reminder').value || null;
    if (!title) { document.getElementById('todo-name').focus(); return; }
    if (isEdit) DB.update('todos', existing.id, { title, dueDate, recurrence: recurrence === 'none' ? null : recurrence, reminderTime });
    else DB.add('todos', { id: uid(), title, done: false, dueDate, recurrence: recurrence === 'none' ? null : recurrence, reminderTime, completedAt: null, createdAt: Date.now() });
    closeModal();
    renderTodoPanel();
  };
  document.getElementById('todo-name').focus();
}

// -- Chore modal --
const CHORE_EMOJIS = ['🛏️','🧹','🚿','🗑️','🍽️','🧺','🌿','🐕','🪟','🚗','💊','📦'];

function openChoreModal(existing) {
  const isEdit = !!existing;
  let displayNum  = existing ? existing.intervalDays : 7;
  let displayUnit = 'days';
  if (existing) {
    const d = existing.intervalDays;
    if (d % 365 === 0 && d >= 365) { displayNum = d / 365; displayUnit = 'years'; }
    else if (d % 30 === 0 && d >= 30) { displayNum = d / 30; displayUnit = 'months'; }
    else if (d % 7 === 0 && d >= 7) { displayNum = d / 7; displayUnit = 'weeks'; }
    else { displayNum = d; displayUnit = 'days'; }
  }

  const currentEmoji = existing?.emoji || '🧹';
  const emojiDots = CHORE_EMOJIS.map(e =>
    '<div class="color-dot" data-emoji="' + e + '" style="background:var(--surface-2);font-size:1.1rem;display:flex;align-items:center;justify-content:center;' +
    (e === currentEmoji ? 'outline:2px solid var(--accent);outline-offset:2px;' : '') + '">' + e + '</div>'
  ).join('');

  const timerVal = existing?.timerMinutes || '';
  openModal(isEdit ? 'Edit Chore' : 'New Chore',
    '<div class="form-group">' +
    '<label class="form-label">Chore name</label>' +
    '<input class="form-input" id="chore-name" placeholder="e.g. Change bedsheets" value="' + escHtml(existing?.title || '') + '" />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label">Repeat every</label>' +
    '<div class="interval-row">' +
    '<input class="form-input" id="chore-interval" type="number" min="1" max="365" value="' + displayNum + '" style="max-width:90px" />' +
    '<select class="form-input" id="chore-unit">' +
    '<option value="days"' + (displayUnit === 'days' ? ' selected' : '') + '>days</option>' +
    '<option value="weeks"' + (displayUnit === 'weeks' ? ' selected' : '') + '>weeks</option>' +
    '<option value="months"' + (displayUnit === 'months' ? ' selected' : '') + '>months</option>' +
    '<option value="years"' + (displayUnit === 'years' ? ' selected' : '') + '>years</option>' +
    '</select></div></div>' +
    '<div class="form-group">' +
    '<label class="form-label">Timer <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional — e.g. 10 for 10-minute timer)</span></label>' +
    '<div class="interval-row">' +
    '<input class="form-input" id="chore-timer" type="number" min="1" max="120" value="' + timerVal + '" placeholder="mins" style="max-width:90px" />' +
    '<span style="font-size:.85rem;color:var(--text-3);align-self:center">minutes</span>' +
    '</div></div>' +
    '<div class="form-group"><label class="form-label">Push reminder <span style="font-weight:400;color:var(--text-3)">(fires only when due)</span></label>' +
    '<input class="form-input" id="chore-reminder" type="time" value="' + (existing && existing.reminderTime ? existing.reminderTime : '') + '" /></div>' +
    '<div class="form-group">' +
    '<label class="form-label">Icon</label>' +
    '<div class="color-picker" style="flex-wrap:wrap;gap:8px">' + emojiDots + '</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn-secondary" id="modal-cancel">Cancel</button>' +
    '<button class="btn-primary" id="modal-save">' + (isEdit ? 'Save changes' : 'Add chore') + '</button>' +
    '</div>'
  );

  let pickedEmoji = currentEmoji;
  document.querySelectorAll('[data-emoji]').forEach(dot => {
    dot.onclick = () => {
      document.querySelectorAll('[data-emoji]').forEach(d => { d.style.outline = ''; d.style.outlineOffset = ''; });
      dot.style.outline = '2px solid var(--accent)';
      dot.style.outlineOffset = '2px';
      pickedEmoji = dot.dataset.emoji;
    };
  });

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const title        = document.getElementById('chore-name').value.trim();
    const rawNum       = parseInt(document.getElementById('chore-interval').value) || 7;
    const unit         = document.getElementById('chore-unit').value;
    const unitMult = unit === 'years' ? 365 : unit === 'months' ? 30 : unit === 'weeks' ? 7 : 1;
    const intervalDays = rawNum * unitMult;
    const timerRaw     = parseInt(document.getElementById('chore-timer').value);
    const timerMinutes = timerRaw > 0 ? timerRaw : null;
    const choreReminder = document.getElementById('chore-reminder') ? (document.getElementById('chore-reminder').value || null) : null;
    if (!title) { document.getElementById('chore-name').focus(); return; }
    if (isEdit) {
      DB.update('chores', existing.id, { title, intervalDays, emoji: pickedEmoji, timerMinutes, reminderTime: choreReminder });
    } else {
      DB.add('chores', { id: uid(), title, emoji: pickedEmoji, intervalDays, timerMinutes, reminderTime: choreReminder, lastDone: null, history: [], createdAt: Date.now() });
    }
    closeModal();
    if (state.activeChore) renderChoreDetail();
    else renderChoresPanel();
  };
  document.getElementById('chore-name').focus();
}


// ─── DATA BACKUP MODAL ────────────────────────────────────────────
function openDataModal() {
  const KEYS = ['projects','tasks','todos','shopping','chores','habits'];
  openModal('Data Backup', `
    <p style="font-size:.85rem;color:var(--text-2);margin-bottom:16px;line-height:1.5">
      Your data lives in this browser's localStorage, tied to this domain.
      Export regularly as a backup, or to import into another device.
    </p>
    <div class="form-actions" style="flex-direction:column;gap:10px">
      <button class="btn-primary" id="export-btn">⬇ Export JSON backup</button>
      <label class="btn-secondary" style="cursor:pointer;text-align:center">
        ⬆ Import JSON backup
        <input type="file" id="import-file" accept=".json" style="display:none" />
      </label>
    </div>
    <div id="import-status" style="margin-top:12px;font-size:.82rem;color:var(--text-2)"></div>
  `);

  document.getElementById('export-btn').onclick = () => {
    const data = {};
    KEYS.forEach(k => { data[k] = DB.get(k); });
    data._exportedAt = new Date().toISOString();
    data._version = 1;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `checkcheck-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  document.getElementById('import-file').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        let imported = 0;
        KEYS.forEach(k => {
          if (Array.isArray(data[k])) { DB.set(k, data[k]); imported++; }
        });
        document.getElementById('import-status').innerHTML =
          `<span style="color:var(--green)">✓ Imported ${imported} collections. Reloading…</span>`;
        setTimeout(() => { closeModal(); render(); }, 1200);
      } catch {
        document.getElementById('import-status').innerHTML =
          `<span style="color:var(--red)">✗ Invalid file — please use a CheckCheck JSON export.</span>`;
      }
    };
    reader.readAsText(file);
  };
}

// ---- BOOTSTRAP ----

let _appInitDone = false;

function _appInit() {
  seedIfEmpty();
  applyTimeBasedTheme();
  setInterval(applyTimeBasedTheme, 60000);

  const modeToggle = document.querySelector('.mode-toggle');
  modeToggle.innerHTML =
    '<div class="mode-toggle-pill">' +
    '<button class="mode-btn active" data-mode="work">Work</button>' +
    '<button class="mode-btn" data-mode="personal">Personal</button>' +
    '</div>';

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.onclick = () => {
      state.mode          = btn.dataset.mode;
      state.prevMode      = state.mode;
      state.activeProject = null;
      state.activeChore   = null;
      render();
    };
  });

  document.getElementById('data-btn').onclick = openDataModal;

  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close').onclick = closeModal;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Start habit reminders if permission already granted
  requestHabitNotifications();

  // Resume any active timer that survived page reload
  if (getActiveTimer()) startGlobalTimerTick();

  // When page becomes visible again (unlock / tab switch): sync + recheck timer
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (_fbUser) fsPull().then(() => render());
      const t = getActiveTimer();
      if (t) {
        if (Date.now() - t.startedAt >= t.durationMs) ringGlobalTimer(t.choreId);
        else { startGlobalTimerTick(); updateTimerBar(); }
      }
    }
  });

  render();
}

function init() {
  // Show auth gate while we wait for Firebase
  document.getElementById('auth-gate').style.display = 'flex';
  document.getElementById('app').style.display = 'none';

  // Handle redirect result first (mobile redirect flow)
  _fbAuth.getRedirectResult().catch(e => console.warn('Redirect result error:', e));

  // Google sign-in button — use redirect (works on iOS Safari + Android)
  document.getElementById('google-signin-btn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    _fbAuth.signInWithRedirect(provider);
  };

  document.getElementById('notif-btn').onclick = function() { openRemindersModal(); };

  // User button → account dropdown
  document.getElementById('user-btn').onclick = (e) => {
    e.stopPropagation();
    const existing = document.getElementById('account-dropdown');
    if (existing) { existing.remove(); return; }
    const u = _fbAuth.currentUser;
    const photoHTML = u && u.photoURL
      ? '<img src="' + u.photoURL + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0" referrerpolicy="no-referrer">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0">' + ((u && u.email || 'U')[0].toUpperCase()) + '</div>';
    const dropdown = document.createElement('div');
    dropdown.id = 'account-dropdown';
    dropdown.style.cssText = 'position:fixed;top:68px;right:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:500;min-width:220px;max-width:280px';
    dropdown.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border-light)">' +
        photoHTML +
        '<div style="min-width:0">' +
          '<div style="font-weight:600;font-size:.9rem;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(u && u.displayName || 'User') + '</div>' +
          '<div style="font-size:.75rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(u && u.email || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<button id="dropdown-reports" style="display:block;width:100%;text-align:left;padding:9px 12px;border-radius:8px;background:none;border:none;color:var(--text-1);font-size:.85rem;font-weight:500;cursor:pointer;font-family:inherit;margin-bottom:2px">\uD83D\uDCCB Reports</button>' +
      '<button id="dropdown-reminders" style="display:block;width:100%;text-align:left;padding:9px 12px;border-radius:8px;background:none;border:none;color:var(--text-1);font-size:.85rem;font-weight:500;cursor:pointer;font-family:inherit;margin-bottom:6px">\uD83D\uDD14 Reminders</button>' +
      '<button id="signout-btn" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);font-size:.85rem;font-weight:500;cursor:pointer;text-align:left;font-family:inherit">Sign out</button>';
    document.body.appendChild(dropdown);
    document.getElementById('dropdown-reports').onclick = (e) => { e.stopPropagation(); dropdown.remove(); state.mode = 'work'; state.workView = 'reports'; render(); };
    document.getElementById('dropdown-reminders').onclick = (e) => { e.stopPropagation(); dropdown.remove(); openRemindersModal(); };
    document.getElementById('signout-btn').onclick = () => {
      _fbAuth.signOut().then(() => window.location.reload());
    };
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeDD() {
        dropdown.remove();
        document.removeEventListener('click', closeDD);
      });
    }, 0);
  };

  _fbAuth.onAuthStateChanged(async user => {
    _fbUser = user;
    if (!user) {
      document.getElementById('auth-gate').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      document.getElementById('notif-btn').style.display = 'none';
      return;
    }
    // Signed in — show app, update avatar
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('notif-btn').style.display = '';
    document.getElementById('app').style.display = '';
    const avatar  = document.getElementById('user-avatar');
    const userBtn = document.getElementById('user-btn');
    if (avatar) {
      if (user.photoURL) {
        avatar.innerHTML = '<img src="' + user.photoURL + '" style="width:26px;height:26px;border-radius:50%;object-fit:cover;display:block" referrerpolicy="no-referrer">';
      } else {
        avatar.textContent = (user.email || 'U')[0].toUpperCase();
      }
    }
    if (userBtn) userBtn.style.display = '';

    // Pull latest data from Firestore before rendering
    await fsPull();

    if (!_appInitDone) {
      _appInitDone = true;
      _appInit();
    } else {
      render();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
