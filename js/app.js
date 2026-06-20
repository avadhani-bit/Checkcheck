import { goPage } from "./ui.js";
import { renderPage } from "./render.js";

// Seed some placeholder data so the UI isn't empty before Firebase is connected
import { state } from "./state.js";

state.projects = [
  { id: "p1", name: "Website Redesign" },
  { id: "p2", name: "Client ABC" },
  { id: "p3", name: "Q3 Planning" }
];

state.tasks = [
  { id: "t1", projectId: "p1", name: "Write homepage copy",    tag: "task",    done: false, type: "work" },
  { id: "t2", projectId: "p1", name: "Design new logo",        tag: "review",  done: true,  type: "work" },
  { id: "t3", projectId: "p2", name: "Send proposal",          tag: "followup",done: false, type: "work" },
  { id: "t4", projectId: "p2", name: "Schedule kickoff call",  tag: "meeting", done: false, type: "work" },
  { id: "t5", projectId: "p3", name: "Define OKRs",            tag: "task",    done: false, type: "work" },
  { id: "t6", projectId: "p3", name: "Budget review",          tag: "urgent",  done: false, type: "work" }
];

state.todos = [
  { id: "td1", name: "Call dentist",         done: false },
  { id: "td2", name: "Renew car registration",done: false },
  { id: "td3", name: "Book flight",          done: true  }
];

state.shopping = [
  { id: "s1", name: "Eggs",   done: false },
  { id: "s2", name: "Milk",   done: false },
  { id: "s3", name: "Bread",  done: true  }
];

state.chores = [
  { id: "c1", name: "Vacuum",       frequency: "Weekly",    color: "#8B5CF6" },
  { id: "c2", name: "Do laundry",   frequency: "Weekly",    color: "#10B981" },
  { id: "c3", name: "Clean kitchen",frequency: "Daily",     color: "#F59E0B" },
  { id: "c4", name: "Take out trash",frequency: "2x/week",  color: "#EF4444" }
];

// Boot
renderPage();

// Sidebar nav
document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});

// Bottom nav (mobile)
document.querySelectorAll(".bottom-nav button[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goPage(btn.dataset.page));
});