import { state } from "./state.js";
import { toggleTask, openProject, goPage } from "./ui.js";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Convert chore freq number to readable string
function freqText(freq) {
  if (freq === 1)  return "Daily";
  if (freq === 7)  return "Weekly";
  if (freq === 14) return "Every 2 weeks";
  if (freq === 30) return "Monthly";
  return freq ? `Every ${freq} days` : "";
}

// Chore freshness color based on how overdue it is
function choreColor(chore) {
  if (!chore.freq || !chore.lastDone) return "#9CA3AF";
  const daysAgo = Math.floor((Date.now() - new Date(chore.lastDone)) / 86400000);
  const pct = daysAgo / chore.freq;
  if (pct >= 1)   return "#EF4444"; // overdue — red
  if (pct >= 0.7) return "#F59E0B"; // due soon — yellow
  return "#10B981";                  // fresh — green
}

/* ── TODAY ── */
export function renderToday() {
  const workTasks     = state.tasks.filter(t => !t.done).slice(0, 6);
  const personalTodos = state.todos.filter(t => !t.done).slice(0, 5);
  const chores        = state.chores.slice(0, 4);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>${getGreeting()}</h1>
        <div class="subtitle">${today()}</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${state.tasks.filter(t => !t.done).length}</div>
        <div class="stat-label">Work tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.todos.filter(t => !t.done).length}</div>
        <div class="stat-label">Personal todos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.shopping.filter(t => !t.checked).length}</div>
        <div class="stat-label">Shopping items</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.chores.length}</div>
        <div class="stat-label">Chores tracked</div>
      </div>
    </div>

    ${workTasks.length ? `
    <div class="card">
      <div class="card-title">Work</div>
      ${workTasks.map(t => taskRow(t)).join("")}
    </div>` : ""}

    ${personalTodos.length ? `
    <div class="card">
      <div class="card-title">Personal</div>
      ${personalTodos.map(t => taskRow(t, "todo")).join("")}
    </div>` : ""}

    ${chores.length ? `
    <div class="card">
      <div class="card-title">Chores</div>
      ${chores.map(c => choreRow(c)).join("")}
    </div>` : ""}
  `;
}

/* ── WORK ── */
export function renderWork() {
  const projects = state.projects;

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>Work</h1>
        <div class="subtitle">${projects.length} project${projects.length !== 1 ? "s" : ""}</div>
      </div>
      <button class="add-btn" onclick="window.__addProject()">+</button>
    </div>

    ${projects.length === 0
      ? `<div class="card"><div class="empty">No projects yet. Hit + to add one.</div></div>`
      : `<div class="project-grid">${projects.map(p => projectCard(p)).join("")}</div>`
    }
  `;
}

/* ── PROJECT ── */
export function renderProject() {
  const p = state.currentProject;
  if (!p) return "";

  const projectTasks = state.tasks.filter(t => t.projectId === p.id);
  const active    = projectTasks.filter(t => !t.done);
  const completed = projectTasks.filter(t => t.done);
  const pct = projectTasks.length
    ? Math.round((completed.length / projectTasks.length) * 100)
    : 0;

  return `
    <div class="topbar">
      <div class="topbar-left">
        <button class="back-btn" onclick="window.__backToWork()">← Work</button>
        <h1>${p.name}</h1>
        <div class="subtitle">${active.length} active · ${completed.length} completed</div>
      </div>
      <button class="add-btn" onclick="window.__addTask()">+</button>
    </div>

    <div class="card">
      <div class="card-title">Progress</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-text">${pct}% complete — ${completed.length} of ${projectTasks.length} tasks done</div>
    </div>

    <div class="card">
      <div class="card-title">Active tasks</div>
      ${active.length === 0
        ? `<div class="empty">All done! Nothing active.</div>`
        : active.map(t => taskRow(t)).join("")}
    </div>

    ${completed.length ? `
    <div class="card">
      <div class="card-title">Completed</div>
      ${completed.map(t => taskRow(t)).join("")}
    </div>` : ""}
  `;
}

/* ── PERSONAL ── */
export function renderPersonal() {
  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>Personal</h1>
      </div>
      <button class="add-btn" onclick="window.__addPersonal()">+</button>
    </div>

    <div class="card">
      <div class="card-title">To-do</div>
      ${state.todos.length === 0
        ? `<div class="empty">Nothing here yet.</div>`
        : state.todos.map(t => taskRow(t, "todo")).join("")}
    </div>

    <div class="card">
      <div class="card-title">Shopping</div>
      ${state.shopping.length === 0
        ? `<div class="empty">List is empty.</div>`
        : state.shopping.map(t => shoppingRow(t)).join("")}
    </div>

    <div class="card">
      <div class="card-title">Chores</div>
      ${state.chores.length === 0
        ? `<div class="empty">No chores tracked yet.</div>`
        : state.chores.map(c => choreRow(c)).join("")}
    </div>
  `;
}

/* ── REPORTS ── */
export function renderReports() {
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const completedTasks    = state.tasks.filter(t => t.done).length;
  const completedTodos    = state.todos.filter(t => t.done).length;
  const completedShopping = state.shopping.filter(t => t.checked).length;
  const total = completedTasks + completedTodos + completedShopping;

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>Reports</h1>
        <div class="subtitle">${month}</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Total completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedTasks}</div>
        <div class="stat-label">Work tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedTodos}</div>
        <div class="stat-label">Personal todos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedShopping}</div>
        <div class="stat-label">Shopping items</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Summary</div>
      <div class="task">
        <div class="task-name">Work tasks completed</div>
        <div class="task-meta">${completedTasks}</div>
      </div>
      <div class="task">
        <div class="task-name">Personal todos completed</div>
        <div class="task-meta">${completedTodos}</div>
      </div>
      <div class="task">
        <div class="task-name">Shopping items checked off</div>
        <div class="task-meta">${completedShopping}</div>
      </div>
      <div class="task">
        <div class="task-name">Projects active</div>
        <div class="task-meta">${state.projects.length}</div>
      </div>
    </div>
  `;
}

/* ── MAIN RENDER ── */
export function renderPage() {
  const container = document.getElementById("page-container");
  if (state.currentPage === "today")    container.innerHTML = renderToday();
  if (state.currentPage === "work")     container.innerHTML = renderWork();
  if (state.currentPage === "project")  container.innerHTML = renderProject();
  if (state.currentPage === "personal") container.innerHTML = renderPersonal();
  if (state.currentPage === "reports")  container.innerHTML = renderReports();
}

/* ── HELPERS ── */
function taskRow(t, collection = "task") {
  // Support both tags array (v1) and priority string (v2)
  const tag = Array.isArray(t.tags) && t.tags.length ? t.tags[0] : (t.priority || null);
  const tagHtml = tag
    ? `<span class="priority priority-${tag}">${tag.charAt(0).toUpperCase() + tag.slice(1)}</span>`
    : "";

  return `
    <div class="task ${t.done ? "done" : ""}">
      <div class="check" onclick="window.__toggleTask('${t.id}', '${collection}')"></div>
      <div class="task-name">${t.name || t.title || t.text || ""}</div>
      ${tagHtml}
    </div>
  `;
}

function shoppingRow(t) {
  // Shopping uses "checked" not "done"
  return `
    <div class="task ${t.checked ? "done" : ""}">
      <div class="check" onclick="window.__toggleTask('${t.id}', 'shopping')"></div>
      <div class="task-name">${t.name || ""}</div>
      ${t.qty ? `<span class="task-meta">${t.qty}</span>` : ""}
    </div>
  `;
}

function projectCard(p) {
  const tasks  = state.tasks.filter(t => t.projectId === p.id);
  const done   = tasks.filter(t => t.done).length;
  const pct    = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const active = tasks.filter(t => !t.done).length;

  return `
    <div class="project-card" onclick="window.__openProject('${p.id}')">
      <div class="project-title">${p.name}</div>
      <div class="project-meta">${active} active task${active !== 1 ? "s" : ""}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-text">${pct}% complete</div>
    </div>
  `;
}

function choreRow(c) {
  const color = choreColor(c);
  const freq  = freqText(c.freq);
  const daysAgo = c.lastDone
    ? Math.floor((Date.now() - new Date(c.lastDone)) / 86400000)
    : null;
  const since = daysAgo === null ? "" :
    daysAgo === 0 ? "Done today" :
    daysAgo === 1 ? "Done yesterday" :
    `${daysAgo} days ago`;

  return `
    <div class="chore-row">
      <div class="chore-dot" style="background:${color}"></div>
      <div class="chore-name">${c.name}</div>
      <div class="chore-freq">${freq}${since ? " · " + since : ""}</div>
    </div>
  `;
}
