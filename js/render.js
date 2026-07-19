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

/* ── TODAY ── */
export function renderToday() {
  const due    = state.tasks.filter(t => !t.done);
  const work   = due.filter(t => t.type === "work").slice(0, 5);
  const personal = state.todos.filter(t => !t.done).slice(0, 5);
  const chores = state.chores.slice(0, 4);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>${getGreeting()}</h1>
        <div class="subtitle">${today()}</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${state.tasks.filter(t=>!t.done).length}</div>
        <div class="stat-label">Work tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.todos.filter(t=>!t.done).length}</div>
        <div class="stat-label">Personal todos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.shopping.filter(t=>!t.done).length}</div>
        <div class="stat-label">Shopping items</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${state.chores.length}</div>
        <div class="stat-label">Chores tracked</div>
      </div>
    </div>

    ${work.length ? `
    <div class="card">
      <div class="card-title">Work</div>
      ${work.map(t => taskRow(t)).join("")}
    </div>` : ""}

    ${personal.length ? `
    <div class="card">
      <div class="card-title">Personal</div>
      ${personal.map(t => taskRow(t, "todo")).join("")}
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
        <div class="subtitle">${projects.length} projects</div>
      </div>
      <button class="add-btn" onclick="window.__addProject()">+</button>
    </div>

    ${projects.length === 0 ? `
      <div class="card"><div class="empty">No projects yet. Hit + to add one.</div></div>
    ` : projects.map(p => projectCard(p)).join("")}
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
  const todos    = state.todos;
  const shopping = state.shopping;
  const chores   = state.chores;

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1>Personal</h1>
      </div>
      <button class="add-btn" onclick="window.__addPersonal()">+</button>
    </div>

    <div class="card">
      <div class="card-title">To-do</div>
      ${todos.length === 0
        ? `<div class="empty">Nothing here yet.</div>`
        : todos.map(t => taskRow(t, "todo")).join("")}
    </div>

    <div class="card">
      <div class="card-title">Shopping</div>
      ${shopping.length === 0
        ? `<div class="empty">List is empty.</div>`
        : shopping.map(t => taskRow(t, "shopping")).join("")}
    </div>

    <div class="card">
      <div class="card-title">Chores</div>
      ${chores.length === 0
        ? `<div class="empty">No chores tracked yet.</div>`
        : chores.map(c => choreRow(c)).join("")}
    </div>
  `;
}

/* ── REPORTS ── */
export function renderReports() {
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const completedTasks    = state.tasks.filter(t => t.done).length;
  const completedTodos    = state.todos.filter(t => t.done).length;
  const completedShopping = state.shopping.filter(t => t.done).length;
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
  return `
    <div class="task ${t.done ? "done" : ""}" data-id="${t.id}" data-collection="${collection}">
      <div class="check" onclick="window.__toggleTask('${t.id}', '${collection}')"></div>
      <div class="task-name">${t.name || t.title || t.text || ""}</div>
      ${t.tag ? `<span class="tag tag-${t.tag}">${t.tag}</span>` : ""}
    </div>
  `;
}

function projectCard(p) {
  const tasks     = state.tasks.filter(t => t.projectId === p.id);
  const done      = tasks.filter(t => t.done).length;
  const pct       = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const active    = tasks.filter(t => !t.done).length;

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
  const color = c.color || "#9CA3AF";
  return `
    <div class="chore-row">
      <div class="chore-dot" style="background:${color}"></div>
      <div class="chore-name">${c.name}</div>
      <div class="chore-freq">${c.frequency || ""}</div>
    </div>
  `;
}