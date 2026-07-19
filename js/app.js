import { goPage } from "./ui.js";
import { renderPage } from "./render.js";
import { state } from "./state.js";
import { auth, loadUserData } from "./firebase.js";

auth.onAuthStateChanged(async user => {
  if (user) {
    state.uid = user.uid;
    try {
      const data = await loadUserData(user.uid);
      state.projects = data.projects;
      state.tasks    = data.tasks;
      state.todos    = data.todos;
      state.shopping = data.shopping;
      state.chores   = data.chores;
      state.habits   = data.habits;
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    renderPage();
  } else {
    state.projects = [];
    state.tasks    = [];
    state.todos    = [];
    state.shopping = [];
    state.chores   = [];
    state.habits   = [];
    renderPage();
  }
});

// Sidebar nav
document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});

// Bottom nav (mobile)
document.querySelectorAll(".bottom-nav button[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});
