import { state } from "./state.js";
import { renderPage } from "./render.js";

export function goPage(page) {
  state.currentPage = page;
  state.currentProject = null;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  renderPage();
}

export function openProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  state.currentProject = project;
  state.currentPage = "project";

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === "work");
  });

  renderPage();
}

export function toggleTask(id, collection = "task") {
  let list;
  if (collection === "todo")     list = state.todos;
  else if (collection === "shopping") list = state.shopping;
  else                           list = state.tasks;

  const item = list.find(t => t.id === id);
  if (item) item.done = !item.done;

  renderPage();
}

export function showModal(type) {
  // placeholder — will wire to Firebase later
  alert(`Add ${type} — coming soon once Firebase is connected.`);
}

// Expose to window so inline onclick handlers in render.js can reach these
window.__toggleTask  = toggleTask;
window.__openProject = openProject;
window.__backToWork  = () => goPage("work");
window.__addProject  = () => showModal("project");
window.__addTask     = () => showModal("task");
window.__addPersonal = () => showModal("personal item");