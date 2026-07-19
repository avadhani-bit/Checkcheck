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
  if (collection === "shopping") {
    const item = state.shopping.find(t => t.id === id);
    if (item) item.checked = !item.checked;
  } else if (collection === "todo") {
    const item = state.todos.find(t => t.id === id);
    if (item) item.done = !item.done;
  } else {
    const item = state.tasks.find(t => t.id === id);
    if (item) item.done = !item.done;
  }
  renderPage();
}

export function toggleHabit(id) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const alreadyDone = (habit.history || []).some(ts => ts >= todayStart.getTime());

  if (alreadyDone) {
    // Un-mark today
    habit.history = (habit.history || []).filter(ts => ts < todayStart.getTime());
  } else {
    // Mark done now
    habit.history = [...(habit.history || []), Date.now()];
  }

  renderPage();
}

export function showModal(type) {
  alert(`Add ${type} — coming soon.`);
}

window.__toggleTask   = toggleTask;
window.__toggleHabit  = toggleHabit;
window.__openProject  = openProject;
window.__backToWork   = () => goPage("work");
window.__addProject   = () => showModal("project");
window.__addTask      = () => showModal("task");
window.__addPersonal  = () => showModal("personal item");
