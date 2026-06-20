/* ================================================================
   CheckCheck — app.js
   All state, storage, rendering, and event handling in one file.
   localStorage-backed; swap DB.*  methods for Firebase when ready.
================================================================ */

'use strict';

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
// Each collection is stored as a JSON array under a key.

const DB = {
  _key: k => `cc_${k}`,
  get: k => {
    try { return JSON.parse(localStorage.getItem(DB._key(k)) || '[]'); }
    catch { return []; }
  },
  set: (k, data) => localStorage.setItem(DB._key(k), JSON.stringify(data)),
  add:    (k, item)    => { const d = DB.get(k); d.push(item);              DB.set(k, d); },
  update: (k, id, patch) => {
    const d = DB.get(k).map(i => i.id === id ? { ...i, ...patch } : i);
    DB.set(k, d);
  },
  remove: (k, id) => DB.set(k, DB.get(k).filter(i => i.id !== id)),
};

// Seed demo data on first run
function seedIfEmpty() {
  if (DB.get('projects').length > 0) return;

  const projects = [
    { id: uid(), name: 'Website Redesign', color: '#6366F1', createdAt: Date.now() },
    { id: uid(), name: 'Client Onboarding', color: '#10B981', createdAt: Date.now() },
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
    { id: uid(), title: 'Eggs', done: false, createdAt: now },
    { id: uid(), title: 'Milk', done: false, createdAt: now },
    { id: uid(), title: 'Bread', done: false, createdAt: now },
  ]);

  DB.set('chores', [
    { id: uid(), title: 'Change bedsheets', emoji: '🛏️', intervalDays: 14, lastDone: now - 20 * 86400000, createdAt: now },
    { id: uid(), title: 'Vacuum',           emoji: '🧹', intervalDays: 7,  lastDone: now - 5 * 86400000,  createdAt: now },
    { id: uid(), title: 'Clean bathroom',   emoji: '🚿', intervalDays: 7,  lastDone: now - 8 * 86400000,  createdAt: now },
    { id: uid(), title: 'Take out trash',   emoji: '🗑️', intervalDays: 3,  lastDone: now - 2 * 86400000,  createdAt: now },
  ]);
}

// ─── APP STATE ────────────────────────────────────────────────────

const state = {
  mode: 'work',          // 'work' | 'personal' | 'reports'
  prevMode: 'work',      // to go back from reports
  activeProject: null,   // project id when inside project view
  personalTab: 'todo',   // 'todo' | 'shopping' | 'chores'
  reportMonth: new Date().getMonth(),
  reportYear:  new Date().getFullYear(),
  completedVisible: {},  // projectId → bool
};

// ─── RENDER ───────────────────────────────────────────────────────

const main = () => document.getElementById('main-content');

function render() {
  if (state.mode === 'work') {
    if (state.activeProject) renderProject();
    else renderWork();
  } else if (state.mode === 'personal') {
    renderPersonal();
  } else if (state.mode === 'reports') {
    renderReports();
  }
  syncHeader();
}

function syncHeader() {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active',
      b.dataset.mode === (state.mode === 'reports' ? state.prevMode : state.mode));
  });
  document.getElementById('reports-btn').classList.toggle('active', state.mode === 'reports');
}

// ── WORK: project list ──────────────────────────────────────────
function renderWork() {
  const projects = DB.get('projects');

  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Work</div>
        <div class="page-subtitle">${projects.length} project${projects.length !== 1 ? 's' : ''}</div>
      </div>
      <button class="add-btn" id="btn-add-project">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        New Project
      </button>
    </div>

    ${projects.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <p>No projects yet.<br>Hit <strong>New Project</strong> to get started.</p>
      </div>
    ` : `<div class="project-grid">${projects.map(projectCard).join('')}</div>`}
  `;

  document.getElementById('btn-add-project').onclick = () => openProjectModal();
}

function projectCard(p) {
  const tasks     = DB.get('tasks').filter(t => t.projectId === p.id);
  const done      = tasks.filter(t => t.done).length;
  const active    = tasks.filter(t => !t.done).length;
  const pct       = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const color     = p.color || '#6366F1';

  return `
    <div class="project-card" style="--project-color:${escHtml(color)}" data-project-id="${p.id}">
      <div class="project-card-name">${escHtml(p.name)}</div>
      <div class="project-card-meta">${active} active · ${done} completed</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-text">${pct}% complete</div>
    </div>
  `;
}

// ── WORK: project detail ────────────────────────────────────────
function renderProject() {
  const projects = DB.get('projects');
  const p = projects.find(x => x.id === state.activeProject);
  if (!p) { state.activeProject = null; return renderWork(); }

  const allTasks  = DB.get('tasks').filter(t => t.projectId === p.id);
  const active    = allTasks.filter(t => !t.done);
  const completed = allTasks.filter(t => t.done);
  const pct       = allTasks.length ? Math.round((completed.length / allTasks.length) * 100) : 0;
  const color     = p.color || '#6366F1';
  const showDone  = state.completedVisible[p.id] ?? false;

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
        <div class="page-subtitle">${active.length} active · ${completed.length} done</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="task-action-btn" id="btn-edit-project" title="Edit project">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="add-btn" id="btn-add-task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Task
        </button>
      </div>
    </div>

    <!-- Progress -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">Progress</span><span style="font-size:.82rem;font-weight:600;color:var(--text-2)">${pct}%</span></div>
      <div style="padding:12px 20px 16px;">
        <div class="progress-bar" style="height:8px;"><div class="progress-fill" style="width:${pct}%;background:${escHtml(color)}"></div></div>
      </div>
    </div>

    <!-- Active tasks -->
    <div class="card" id="active-tasks-card">
      <div class="card-header"><span class="card-title">Active tasks (${active.length})</span></div>
      <div class="task-list" id="active-task-list">
        ${active.length === 0
          ? '<div class="empty-state" style="padding:28px 20px"><p>All done! Nothing active.</p></div>'
          : active.map(t => taskRow(t, p)).join('')}
      </div>
      <div class="inline-add">
        <input class="inline-add-input" id="quick-add-input" placeholder="Add a task…" />
        <button class="inline-add-btn" id="quick-add-btn">Add</button>
      </div>
    </div>

    <!-- Completed tasks (collapsible) -->
    ${completed.length > 0 ? `
    <div class="card">
      <div class="completed-toggle ${showDone ? 'open' : ''}" id="completed-toggle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        Completed (${completed.length})
      </div>
      ${showDone ? `<div class="task-list">${completed.map(t => taskRow(t, p)).join('')}</div>` : ''}
    </div>` : ''}
  `;

  document.getElementById('btn-back').onclick = () => { state.activeProject = null; renderWork(); };
  document.getElementById('btn-add-task').onclick = () => openTaskModal(p);
  document.getElementById('btn-edit-project').onclick = () => openProjectModal(p);

  const qInput = document.getElementById('quick-add-input');
  const qBtn   = document.getElementById('quick-add-btn');
  const quickAdd = () => {
    const title = qInput.value.trim();
    if (!title) return;
    DB.add('tasks', { id: uid(), projectId: p.id, title, done: false, dueDate: null, completedAt: null, createdAt: Date.now() });
    qInput.value = '';
    render();
  };
  qBtn.onclick = quickAdd;
  qInput.addEventListener('keydown', e => { if (e.key === 'Enter') quickAdd(); });

  const toggle = document.getElementById('completed-toggle');
  if (toggle) {
    toggle.onclick = () => {
      state.completedVisible[p.id] = !(state.completedVisible[p.id] ?? false);
      render();
    };
  }

  // Wire task check & delete from the rendered lists
  wireTaskEvents();
}

function taskRow(t, project) {
  const due = !t.done ? fmt.dueLabel(t.dueDate) : null;
  return `
    <div class="task-row ${t.done ? 'done' : ''}" data-task-id="${t.id}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-check-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
        ${t.done && t.completedAt ? `<div class="task-due">${fmt.relativeDay(t.completedAt)}</div>` : ''}
      </div>
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

function wireTaskEvents() {
  // Check/uncheck
  document.querySelectorAll('[data-check-id]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.checkId;
      const tasks = DB.get('tasks');
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      const done = !t.done;
      DB.update('tasks', id, { done, completedAt: done ? Date.now() : null });
      render();
    };
  });
  // Edit
  document.querySelectorAll('[data-edit-task]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const task = DB.get('tasks').find(t => t.id === el.dataset.editTask);
      if (task) openTaskModal(null, task);
    };
  });
  // Delete
  document.querySelectorAll('[data-delete-task]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      if (confirm('Delete this task?')) {
        DB.remove('tasks', el.dataset.deleteTask);
        render();
      }
    };
  });
}

// ── PERSONAL ────────────────────────────────────────────────────
function renderPersonal() {
  main().innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">Personal</div>
      </div>
    </div>
    <div class="section-tabs">
      <button class="tab-btn ${state.personalTab === 'todo' ? 'active' : ''}" data-tab="todo">To-do</button>
      <button class="tab-btn ${state.personalTab === 'shopping' ? 'active' : ''}" data-tab="shopping">Shopping</button>
      <button class="tab-btn ${state.personalTab === 'chores' ? 'active' : ''}" data-tab="chores">Chores</button>
    </div>
    <div id="personal-panel"></div>
  `;

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.onclick = () => { state.personalTab = btn.dataset.tab; renderPersonal(); };
  });

  if (state.personalTab === 'todo')     renderTodoPanel();
  if (state.personalTab === 'shopping') renderShoppingPanel();
  if (state.personalTab === 'chores')   renderChoresPanel();
}

// ─ Todo ─
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
          : active.map(t => todoRow(t)).join('')}
        ${done.length > 0 ? `
          <div class="section-divider">Done (${done.length})</div>
          ${done.map(t => todoRow(t)).join('')}
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
    DB.add('todos', { id: uid(), title, done: false, dueDate: null, completedAt: null, createdAt: Date.now() });
    input.value = '';
    renderTodoPanel();
  };
  document.getElementById('todo-add-btn').onclick = addTodo;
  document.getElementById('todo-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
  document.getElementById('clear-todos')?.addEventListener('click', () => {
    DB.set('todos', DB.get('todos').filter(t => !t.done));
    renderTodoPanel();
  });

  document.querySelectorAll('[data-todo-check]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.todoCheck;
      const t  = DB.get('todos').find(x => x.id === id);
      if (!t) return;
      DB.update('todos', id, { done: !t.done, completedAt: !t.done ? Date.now() : null });
      renderTodoPanel();
    };
  });
  document.querySelectorAll('[data-todo-delete]').forEach(el => {
    el.onclick = () => {
      if (confirm('Delete this item?')) { DB.remove('todos', el.dataset.todoDelete); renderTodoPanel(); }
    };
  });
  document.querySelectorAll('[data-todo-edit]').forEach(el => {
    el.onclick = () => {
      const t = DB.get('todos').find(x => x.id === el.dataset.todoEdit);
      if (t) openTodoModal(t);
    };
  });
}

function todoRow(t) {
  const due = !t.done ? fmt.dueLabel(t.dueDate) : null;
  return `
    <div class="task-row ${t.done ? 'done' : ''}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-todo-check="${t.id}"></div>
      <div class="task-body">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
      </div>
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

// ─ Shopping ─
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
  };
  document.getElementById('shop-add-btn').onclick = addShop;
  document.getElementById('shop-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') addShop(); });
  document.getElementById('clear-shopping')?.addEventListener('click', () => {
    DB.set('shopping', DB.get('shopping').filter(i => !i.done));
    renderShoppingPanel();
  });

  document.querySelectorAll('[data-shop-check]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.shopCheck;
      const i  = DB.get('shopping').find(x => x.id === id);
      if (!i) return;
      DB.update('shopping', id, { done: !i.done });
      renderShoppingPanel();
    };
  });
  document.querySelectorAll('[data-shop-delete]').forEach(el => {
    el.onclick = () => {
      DB.remove('shopping', el.dataset.shopDelete);
      renderShoppingPanel();
    };
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

// ─ Chores ─
function renderChoresPanel() {
  const chores = DB.get('chores');
  const panel  = document.getElementById('personal-panel');

  // Sort: overdue first, then by urgency
  const withStatus = chores.map(c => ({ ...c, status: choreStatus(c) }));
  withStatus.sort((a, b) => {
    const order = { overdue: 0, soon: 1, ok: 2, never: 3 };
    return (order[a.status.key] ?? 9) - (order[b.status.key] ?? 9);
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
          : withStatus.map(choreRow).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-add-chore').onclick = () => openChoreModal();

  document.querySelectorAll('[data-chore-done]').forEach(el => {
    el.onclick = () => {
      DB.update('chores', el.dataset.choreDone, { lastDone: Date.now() });
      renderChoresPanel();
    };
  });
  document.querySelectorAll('[data-chore-edit]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const c = DB.get('chores').find(x => x.id === el.dataset.choreEdit);
      if (c) openChoreModal(c);
    };
  });
  document.querySelectorAll('[data-chore-delete]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      if (confirm('Delete this chore?')) { DB.remove('chores', el.dataset.choreDelete); renderChoresPanel(); }
    };
  });
}

function choreStatus(c) {
  if (!c.lastDone) return { key: 'never', text: 'Never done', cls: 'never' };
  const daysSince = (Date.now() - c.lastDone) / 86400000;
  const pct       = daysSince / c.intervalDays;
  const daysLeft  = c.intervalDays - daysSince;

  if (pct >= 1) {
    const over = Math.round(daysSince - c.intervalDays);
    return {
      key: 'overdue',
      text: `Overdue — last done ${fmt.relativeDay(c.lastDone)}`,
      cls: 'overdue',
    };
  }
  if (pct >= 0.75) {
    return { key: 'soon', text: `Due soon — last done ${fmt.relativeDay(c.lastDone)}`, cls: 'soon' };
  }
  return { key: 'ok', text: `Last done ${fmt.relativeDay(c.lastDone)}`, cls: 'ok' };
}

function choreRow(c) {
  const status = choreStatus(c);
  const emoji  = c.emoji || '🔧';
  const colors = { overdue: '#FEE2E2', soon: '#FEF9C3', ok: '#D1FAE5', never: '#F3F4F6' };
  const bg     = colors[status.key] || colors.never;

  return `
    <div class="chore-row">
      <div class="chore-icon" style="background:${bg}">${emoji}</div>
      <div class="chore-body">
        <div class="chore-name">${escHtml(c.title)}</div>
        <div class="chore-status ${status.cls}">${status.text}</div>
      </div>
      <div class="chore-actions">
        <button class="chore-done-btn" data-chore-done="${c.id}">✓ Done</button>
        <button class="task-action-btn" data-chore-edit="${c.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn delete" data-chore-delete="${c.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ── REPORTS ─────────────────────────────────────────────────────
function renderReports() {
  const month = state.reportMonth;
  const year  = state.reportYear;
  const now   = new Date();

  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Completed tasks in this month
  const allTasks = DB.get('tasks');
  const monthTasks = allTasks.filter(t => {
    if (!t.done || !t.completedAt) return false;
    const d = new Date(t.completedAt);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  // Stats
  const totalDone  = monthTasks.length;
  const projects   = DB.get('projects');
  const activeProj = allTasks.filter(t => !t.done).map(t => t.projectId);
  const uniqueActive = new Set(activeProj).size;

  // Calendar heatmap
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay(); // 0=Sun

  const countsByDay = {};
  monthTasks.forEach(t => {
    const d = new Date(t.completedAt).getDate();
    countsByDay[d] = (countsByDay[d] || 0) + 1;
  });

  const calCells = [];
  for (let i = 0; i < firstDay; i++) calCells.push(`<div class="cal-day empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const count   = countsByDay[d] || 0;
    const capped  = Math.min(count, 5);
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    const tooltip = `${d} ${new Date(year, month, d).toLocaleDateString('en-US', { month: 'short' })}: ${count} task${count !== 1 ? 's' : ''}`;
    calCells.push(`<div class="cal-day ${isToday ? 'today' : ''}" data-count="${capped}" data-tooltip="${escHtml(tooltip)}">${d}</div>`);
  }

  // Per-project breakdown
  const projCounts = {};
  monthTasks.forEach(t => {
    projCounts[t.projectId] = (projCounts[t.projectId] || 0) + 1;
  });
  const maxCount = Math.max(...Object.values(projCounts), 1);
  const projRows = projects
    .filter(p => projCounts[p.id])
    .sort((a, b) => (projCounts[b.id] || 0) - (projCounts[a.id] || 0))
    .map(p => {
      const count = projCounts[p.id] || 0;
      const pct   = Math.round((count / maxCount) * 100);
      return `
        <div class="project-bar-row">
          <div class="project-bar-name">${escHtml(p.name)}</div>
          <div class="project-bar-track">
            <div class="project-bar-fill" style="width:${pct}%;background:${escHtml(p.color || '#6366F1')}"></div>
          </div>
          <div class="project-bar-count">${count}</div>
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
        <div class="stat-label">Tasks completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${projects.length}</div>
        <div class="stat-label">Total projects</div>
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

    <!-- Calendar heatmap -->
    <div class="card" style="padding:20px;">
      <div class="report-section-title">Daily completions — ${monthName}</div>
      <div class="calendar-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-day-label">${d}</div>`).join('')}
        ${calCells.join('')}
      </div>
    </div>

    <!-- Per-project breakdown -->
    ${projRows ? `
    <div class="card" style="padding:20px;">
      <div class="report-section-title">By project</div>
      ${projRows}
    </div>` : `
    <div class="card" style="padding:28px 20px;text-align:center;color:var(--text-3);font-size:.9rem;">
      No tasks completed in ${monthName}.
    </div>`}
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
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

// Project modal
function openProjectModal(existing) {
  const isEdit = !!existing;
  const defaultColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const currentColor = existing?.color || defaultColor;

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
    <div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--border-light);">
      <button class="task-action-btn delete" id="delete-project" style="opacity:1;padding:8px 14px;font-size:.82rem;color:var(--red);font-weight:500;">
        Delete project and all tasks
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
    if (isEdit) {
      DB.update('projects', existing.id, { name, color: pickedColor });
    } else {
      DB.add('projects', { id: uid(), name, color: pickedColor, createdAt: Date.now() });
    }
    closeModal();
    render();
  };
  document.getElementById('proj-name').focus();

  if (isEdit) {
    document.getElementById('delete-project').onclick = () => {
      if (!confirm(`Delete "${existing.name}" and all its tasks?`)) return;
      DB.remove('projects', existing.id);
      DB.set('tasks', DB.get('tasks').filter(t => t.projectId !== existing.id));
      closeModal();
      state.activeProject = null;
      render();
    };
  }
}

// Task modal
function openTaskModal(project, existing) {
  const isEdit = !!existing;
  const proj   = project || DB.get('projects').find(p => p.id === existing?.projectId);

  openModal(isEdit ? 'Edit Task' : `Add Task`, `
    <div class="form-group">
      <label class="form-label">Task name</label>
      <input class="form-input" id="task-name" placeholder="What needs to be done?" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Due date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);">(optional)</span></label>
      <input class="form-input" id="task-due" type="date" value="${existing?.dueDate || ''}" />
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
    if (!title) { document.getElementById('task-name').focus(); return; }
    if (isEdit) {
      DB.update('tasks', existing.id, { title, dueDate });
    } else {
      DB.add('tasks', { id: uid(), projectId: proj.id, title, done: false, dueDate, completedAt: null, createdAt: Date.now() });
    }
    closeModal();
    render();
  };
  document.getElementById('task-name').focus();
}

// Todo modal
function openTodoModal(existing) {
  const isEdit = !!existing;
  openModal(isEdit ? 'Edit To-do' : 'New To-do', `
    <div class="form-group">
      <label class="form-label">What needs to be done?</label>
      <input class="form-input" id="todo-name" placeholder="e.g. Call dentist" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Due date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);">(optional)</span></label>
      <input class="form-input" id="todo-due" type="date" value="${existing?.dueDate || ''}" />
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Add'}</button>
    </div>
  `);

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const title   = document.getElementById('todo-name').value.trim();
    const dueDate = document.getElementById('todo-due').value || null;
    if (!title) { document.getElementById('todo-name').focus(); return; }
    if (isEdit) DB.update('todos', existing.id, { title, dueDate });
    else DB.add('todos', { id: uid(), title, done: false, dueDate, completedAt: null, createdAt: Date.now() });
    closeModal();
    renderTodoPanel();
  };
  document.getElementById('todo-name').focus();
}

// Chore modal
const CHORE_EMOJIS = ['🛏️','🧹','🚿','🗑️','🍽️','🧺','🌿','🐕','🪟','🚗','💊','📦'];

function openChoreModal(existing) {
  const isEdit = !!existing;
  const defaultInterval = existing ? String(existing.intervalDays) : '7';

  openModal(isEdit ? 'Edit Chore' : 'New Chore', `
    <div class="form-group">
      <label class="form-label">Chore name</label>
      <input class="form-input" id="chore-name" placeholder="e.g. Change bedsheets" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Repeat every</label>
      <div class="interval-row">
        <input class="form-input" id="chore-interval" type="number" min="1" max="365" value="${defaultInterval}" style="max-width:90px" />
        <select class="form-input" id="chore-unit">
          <option value="days">days</option>
          <option value="weeks" ${Number(defaultInterval) % 7 === 0 ? 'selected' : ''}>weeks</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Icon</label>
      <div class="color-picker" style="flex-wrap:wrap;gap:8px;">
        ${CHORE_EMOJIS.map(e => `<div class="color-dot" data-emoji="${e}" style="background:var(--surface-2);font-size:1.1rem;display:flex;align-items:center;justify-content:center;${e === (existing?.emoji || '🧹') ? 'outline:2px solid var(--accent);outline-offset:2px;' : ''}">${e}</div>`).join('')}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save changes' : 'Add chore'}</button>
    </div>
  `);

  let pickedEmoji = existing?.emoji || '🧹';

  document.querySelectorAll('[data-emoji]').forEach(dot => {
    dot.onclick = () => {
      document.querySelectorAll('[data-emoji]').forEach(d => d.style.outline = '');
      dot.style.outline = '2px solid var(--accent)';
      dot.style.outlineOffset = '2px';
      pickedEmoji = dot.dataset.emoji;
    };
  });

  // Convert weeks → days on save
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-save').onclick = () => {
    const title    = document.getElementById('chore-name').value.trim();
    const rawNum   = parseInt(document.getElementById('chore-interval').value) || 7;
    const unit     = document.getElementById('chore-unit').value;
    const intervalDays = unit === 'weeks' ? rawNum * 7 : rawNum;
    if (!title) { document.getElementById('chore-name').focus(); return; }
    if (isEdit) {
      DB.update('chores', existing.id, { title, intervalDays, emoji: pickedEmoji });
    } else {
      DB.add('chores', { id: uid(), title, emoji: pickedEmoji, intervalDays, lastDone: null, createdAt: Date.now() });
    }
    closeModal();
    renderChoresPanel();
  };
  document.getElementById('chore-name').focus();
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────

function init() {
  seedIfEmpty();

  // Build mode toggle pill (replaces placeholder markup)
  const modeToggle = document.querySelector('.mode-toggle');
  modeToggle.innerHTML = `
    <div class="mode-toggle-pill">
      <button class="mode-btn active" data-mode="work">Work</button>
      <button class="mode-btn" data-mode="personal">Personal</button>
    </div>
  `;

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.onclick = () => {
      state.mode = btn.dataset.mode;
      state.prevMode = state.mode;
      state.activeProject = null;
      render();
    };
  });

  document.getElementById('reports-btn').onclick = () => {
    if (state.mode === 'reports') {
      state.mode = state.prevMode || 'work';
    } else {
      state.prevMode = state.mode === 'reports' ? 'work' : state.mode;
      state.mode = 'reports';
    }
    render();
  };

  // Close modal on backdrop click
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Esc closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Project card clicks (delegated)
  document.getElementById('main-content').addEventListener('click', e => {
    const card = e.target.closest('.project-card');
    if (card && card.dataset.projectId) {
      state.activeProject = card.dataset.projectId;
      state.mode = 'work';
      render();
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
