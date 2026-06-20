/* ================================================================
   CheckCheck — app.js
   All state, storage, rendering, and event handling in one file.
   localStorage-backed; swap DB.* methods for Firebase when ready.
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

const DB = {
  _key: k => `cc_${k}`,
  get: k => {
    try { return JSON.parse(localStorage.getItem(DB._key(k)) || '[]'); }
    catch { return []; }
  },
  set: (k, data) => localStorage.setItem(DB._key(k), JSON.stringify(data)),
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
}

// ─── THEME ───────────────────────────────────────────────────────

function applyTimeBasedTheme() {
  const hour = new Date().getHours();
  const isDark = hour < 7 || hour >= 19; // dark before 7am, after 7pm
  document.body.classList.toggle('dark', isDark);
}

// ─── APP STATE ────────────────────────────────────────────────────

const state = {
  mode:          'work',     // 'work' | 'personal' | 'reports'
  prevMode:      'work',
  activeProject: null,       // project id when in completed-task detail
  activeChore:   null,       // chore id when in chore history detail
  personalTab:   'todo',     // 'todo' | 'shopping' | 'chores'
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
    else renderWork();
  } else if (state.mode === 'personal') {
    if (state.activeChore && state.personalTab === 'chores') renderChoreDetail();
    else renderPersonal();
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

// ─── WORK VIEW (expanded cards with inline tasks) ─────────────────

function renderWork() {
  const projects = DB.get('projects');
  const allTasks = DB.get('tasks');

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

    ${projects.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📁</div><p>No projects yet.<br>Hit <strong>New Project</strong> to get started.</p></div>`
      : `<div class="project-board">${projects.map(p => expandedProjectCard(p, allTasks)).join('')}</div>
         ${workSummaryHTML(projects, allTasks)}`}
  `;

  document.getElementById('btn-add-project').onclick = () => openProjectModal();

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
}

function workSummaryHTML(projects, allTasks) {
  const now  = new Date();
  const y    = now.getFullYear(), m = now.getMonth();

  const open  = allTasks.filter(t => !t.done);
  const doneThisMonth = allTasks.filter(t => {
    if (!t.done || !t.completedAt) return false;
    const d = new Date(t.completedAt);
    return d.getFullYear() === y && d.getMonth() === m;
  });

  // Due this week (Sun–Sat)
  const startOfWeek = new Date(now); startOfWeek.setHours(0,0,0,0);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek   = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7);
  const dueSoon = open.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= startOfWeek && d < endOfWeek;
  }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const dueSoonRows = dueSoon.length === 0
    ? ''
    : `<div class="summary-due-list">
        ${dueSoon.map(t => {
          const proj = projects.find(p => p.id === t.projectId);
          const color = proj ? (proj.color || '#6366F1') : '#6366F1';
          return `<div class="summary-due-row">
            <span class="summary-due-dot" style="background:${escHtml(color)}"></span>
            <span class="summary-due-name">${escHtml(t.title)}</span>
            <span class="summary-due-project">${proj ? escHtml(proj.name) : ''}</span>
            <span class="summary-due-date">${fmt.dateShort(t.dueDate)}</span>
          </div>`;
        }).join('')}
      </div>`;

  return `
  <div class="work-summary">
    <div class="work-summary-stats">
      <div class="ws-stat">
        <div class="ws-stat-val">${open.length}</div>
        <div class="ws-stat-lbl">Open tasks</div>
      </div>
      <div class="ws-stat">
        <div class="ws-stat-val">${projects.length}</div>
        <div class="ws-stat-lbl">Projects</div>
      </div>
      <div class="ws-stat">
        <div class="ws-stat-val">${dueSoon.length}</div>
        <div class="ws-stat-lbl">Due this week</div>
      </div>
      <div class="ws-stat">
        <div class="ws-stat-val">${doneThisMonth.length}</div>
        <div class="ws-stat-lbl">Done this month</div>
      </div>
    </div>
    ${dueSoon.length > 0 ? `
    <div class="work-summary-section">
      <div class="work-summary-label">Due this week</div>
      ${dueSoonRows}
    </div>` : ''}
  </div>`;
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
    <div class="task-row">
      <div class="task-check" data-check-id="${t.id}"></div>
      <div class="task-body">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
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
      <div class="task-body">
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
    </div>
    <div id="personal-panel"></div>
  `;

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.onclick = () => {
      state.personalTab = btn.dataset.tab;
      state.activeChore = null;
      renderPersonal();
    };
  });

  if (state.personalTab === 'todo')     renderTodoPanel();
  if (state.personalTab === 'shopping') renderShoppingPanel();
  if (state.personalTab === 'chores')   renderChoresPanel();
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
      const t = DB.get('todos').find(x => x.id === el.dataset.todoCheck);
      if (!t) return;
      DB.update('todos', t.id, { done: !t.done, completedAt: !t.done ? Date.now() : null });
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

function todoRow(t) {
  const due = !t.done ? fmt.dueLabel(t.dueDate) : null;
  return `
    <div class="task-row ${t.done ? 'done' : ''}">
      <div class="task-check ${t.done ? 'checked' : ''}" data-todo-check="${t.id}"></div>
      <div class="task-body">
        <div class="task-name">${escHtml(t.title)}</div>
        ${due ? `<div class="task-due ${due.cls}">${due.text}</div>` : ''}
      </div>
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

  return `
    <div class="chore-row" data-chore-detail="${c.id}" style="cursor:pointer">
      <div class="chore-icon" style="background:${bg}">${c.emoji || '🔧'}</div>
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

function miniCalendar(history, month, year) {
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

  const labels = ['S','M','T','W','T','F','S'].map(l => `<div class="mini-cal-label">${l}</div>`).join('');
  const blanks  = Array(firstDay).fill('<div class="mini-cal-day empty"></div>').join('');
  const days    = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const done    = doneDays.has(d);
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    days.push(`<div class="mini-cal-day${done ? ' done' : ''}${isToday ? ' today' : ''}">${d}</div>`);
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

  const intervalLabel = chore.intervalDays < 7
    ? `${chore.intervalDays} days`
    : chore.intervalDays === 7
      ? 'weekly'
      : chore.intervalDays === 14
        ? 'every 2 weeks'
        : `every ${chore.intervalDays} days`;

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
      <div style="display:flex;gap:8px">
        <button class="task-action-btn" id="edit-chore-btn" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
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
            results.push(miniCalendar(history, m, y));
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
    renderChoreDetail(); // refresh in-place
  };

  document.getElementById('edit-chore-btn').onclick = () => {
    const c = DB.get('chores').find(x => x.id === state.activeChore);
    if (c) openChoreModal(c);
  };
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
    if (isEdit) DB.update('tasks', existing.id, { title, dueDate });
    else DB.add('tasks', { id: uid(), projectId: proj.id, title, done: false, dueDate, completedAt: null, createdAt: Date.now() });
    closeModal();
    render();
  };
  document.getElementById('task-name').focus();
}

// -- Todo modal --
function openTodoModal(existing) {
  const isEdit = !!existing;
  openModal(isEdit ? 'Edit To-do' : 'New To-do', `
    <div class="form-group">
      <label class="form-label">What needs to be done?</label>
      <input class="form-input" id="todo-name" placeholder="e.g. Call dentist" value="${escHtml(existing?.title || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label">Due date <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">(optional)</span></label>
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

// -- Chore modal --
const CHORE_EMOJIS = ['🛏️','🧹','🚿','🗑️','🍽️','🧺','🌿','🐕','🪟','🚗','💊','📦'];

function openChoreModal(existing) {
  const isEdit = !!existing;
  let displayNum  = existing ? existing.intervalDays : 7;
  let displayUnit = 'days';
  if (existing && existing.intervalDays % 7 === 0 && existing.intervalDays >= 7) {
    displayNum  = existing.intervalDays / 7;
    displayUnit = 'weeks';
  }

  const currentEmoji = existing?.emoji || '🧹';
  const emojiDots = CHORE_EMOJIS.map(e =>
    '<div class="color-dot" data-emoji="' + e + '" style="background:var(--surface-2);font-size:1.1rem;display:flex;align-items:center;justify-content:center;' +
    (e === currentEmoji ? 'outline:2px solid var(--accent);outline-offset:2px;' : '') + '">' + e + '</div>'
  ).join('');

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
    '</select></div></div>' +
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
    const intervalDays = unit === 'weeks' ? rawNum * 7 : rawNum;
    if (!title) { document.getElementById('chore-name').focus(); return; }
    if (isEdit) {
      DB.update('chores', existing.id, { title, intervalDays, emoji: pickedEmoji });
    } else {
      DB.add('chores', { id: uid(), title, emoji: pickedEmoji, intervalDays, lastDone: null, history: [], createdAt: Date.now() });
    }
    closeModal();
    if (state.activeChore) renderChoreDetail();
    else renderChoresPanel();
  };
  document.getElementById('chore-name').focus();
}

// ---- BOOTSTRAP ----

function init() {
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

  document.getElementById('reports-btn').onclick = () => {
    if (state.mode === 'reports') {
      state.mode = state.prevMode || 'work';
    } else {
      state.prevMode = state.mode === 'reports' ? 'work' : state.mode;
      state.mode = 'reports';
    }
    render();
  };

  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close').onclick = closeModal;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  render();
}

document.addEventListener('DOMContentLoaded', init);
