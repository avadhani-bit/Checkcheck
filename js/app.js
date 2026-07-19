import { goPage } from "./ui.js";
import { renderPage } from "./render.js";
import { state } from "./state.js";

// ── Placeholder data ──
state.projects = [
  { id: "p1", name: "Website Redesign" },
  { id: "p2", name: "Client ABC" },
  { id: "p3", name: "Q3 Planning" }
];

state.tasks = [
  { id: "t1", projectId: "p1", name: "Write homepage copy",     priority: "high",   done: false, type: "work" },
  { id: "t2", projectId: "p1", name: "Design new logo",         priority: "medium", done: true,  type: "work" },
  { id: "t3", projectId: "p2", name: "Send proposal",           priority: "urgent", done: false, type: "work" },
  { id: "t4", projectId: "p2", name: "Schedule kickoff call",   priority: "medium", done: false, type: "work" },
  { id: "t5", projectId: "p3", name: "Define OKRs",             priority: "high",   done: false, type: "work" },
  { id: "t6", projectId: "p3", name: "Budget review",           priority: "urgent", done: false, type: "work" },
  { id: "t7", projectId: "p1", name: "Review analytics setup",  priority: "low",    done: false, type: "work" }
];

state.todos = [
  { id: "td1", name: "Call dentist",          priority: "medium", done: false },
  { id: "td2", name: "Renew car registration", priority: "high",   done: false },
  { id: "td3", name: "Book flight",            priority: "low",    done: true  }
];

state.shopping = [
  { id: "s1", name: "Eggs",  done: false },
  { id: "s2", name: "Milk",  done: false },
  { id: "s3", name: "Bread", done: true  }
];

state.chores = [
  { id: "c1", name: "Vacuum",        frequency: "Weekly",  color: "#8B5CF6" },
  { id: "c2", name: "Do laundry",    frequency: "Weekly",  color: "#10B981" },
  { id: "c3", name: "Clean kitchen", frequency: "Daily",   color: "#F59E0B" },
  { id: "c4", name: "Take out trash",frequency: "2x/week", color: "#EF4444" }
];

// ── Boot ──
renderPage();

// ── Sidebar nav ──
document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});

// ── Bottom nav (mobile) ──
document.querySelectorAll(".bottom-nav button[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});
