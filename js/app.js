import { goPage } from "./ui.js";
import { renderPage } from "./render.js";
import { state } from "./state.js";
import { auth, db, loadUserData } from "./firebase.js";

// ── Auth state ──
auth.onAuthStateChanged(async user => {

  if (user) {
    // Signed in — load real data
    state.uid = user.uid;

    try {
      const data = await loadUserData(user.uid);
      state.projects = data.projects;
      state.tasks    = data.tasks;
      state.todos    = data.todos;
      state.shopping = data.shopping;
      state.chores   = data.chores;
    } catch (err) {
      console.error("Failed to load data:", err);
    }

    renderPage();

  } else {
    // Not signed in — sign in anonymously for now,
    // or show a sign-in prompt later
    // For now, load with empty state so UI still works
    state.projects = [];
    state.tasks    = [];
    state.todos    = [];
    state.shopping = [];
    state.chores   = [];

    renderPage();
  }

});

// ── Sidebar nav ──
document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});

// ── Bottom nav (mobile) ──
document.querySelectorAll(".bottom-nav button[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});
