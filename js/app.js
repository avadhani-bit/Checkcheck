// ══════════════════════════════════════════════════════════
//  Checkcheck — app.js
//  Firebase project: checkcheck-3d35f
// ══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ──────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBpUUVpBIsuKAx1Tw-cnN4ItXho7IqbMMQ",
  authDomain: "checkcheck-3d35f.firebaseapp.com",
  projectId: "checkcheck-3d35f",
  storageBucket: "checkcheck-3d35f.firebasestorage.app",
  messagingSenderId: "744363444071",
  appId: "1:744363444071:web:5e72bf03a2771ae83c91c2",
  measurementId: "G-JZH4HZG0ZK"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
const gProvider = new GoogleAuthProvider();

// ── App state ─────────────────────────────────────────────
let uid = null;
let unsubs = [];

let projects  = [];   // {id, name, color, collapsed}
let tasks     = [];   // {id, projectId, name, tags, due, note, done, doneAt}
let shopping  = [];   // {id, name, qty, checked}
let todos     = [];   // {id, name, due, note, done, doneAt}
let chores    = [];   // {id, name, freq, lastDone, history:[{date,days}]}

// UI state
let currentTab    = 'work';
let currentSub    = 'shopping';
let currentProjId = null;
let currentChoreId = null;
let showingReport = false;
let selectedColor = '#8B7FFA';
let reportMonthOffset = 0;  // 0 = current month, -1 = last month, etc.

// ── Firestore helpers ─────────────────────────────────────
const userCol = name => collection(db, 'users', uid, name);
const userDoc = (col, id) => doc(db, 'users', uid, col, id);
const newId   = () => Math.random().toString(36).slice(2, 10);
const today   = () => new Date().toISOString().slice(0, 10);

// ── Auth ──────────────────────────────────────────────────
document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, gProvider);
  } catch (e) {
    showToast('Sign-in failed — try again');
    console.error(e);
  }
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  goScreen('screen-main');
  unsubs.forEach(u => u());
  unsubs = [];
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (user) {
    uid = user.uid;
    // Set avatar
    const av = user.photoURL || '';
    document.getElementById('user-avatar').src = av;
    document.getElementById('user-menu-avatar').src = av;
    document.getElementById('user-menu-name').textContent  = user.displayName || '';
    document.getElementById('user-menu-email').textContent = user.email || '';
    // Show app
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    initGreeting();
    subscribeAll();
  } else {
    uid = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});

// ── Firestore subscriptions ───────────────────────────────
function subscribeAll() {
  unsubs.push(
    onSnapshot(query(userCol('projects'), orderBy('createdAt')), snap => {
      projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderWorkView();
    }),
    onSnapshot(query(userCol('tasks'), orderBy('createdAt')), snap => {
      tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderWorkView();
      if (currentProjId) renderProjectDetail(currentProjId);
    }),
    onSnapshot(query(userCol('shopping'), orderBy('createdAt')), snap => {
      shopping = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderShopping();
    }),
    onSnapshot(query(userCol('todos'), orderBy('createdAt')), snap => {
      todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTodos();
    }),
    onSnapshot(query(userCol('chores'), orderBy('createdAt')), snap => {
      chores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderChores();
      if (currentChoreId) renderChoreDetail(currentChoreId);
    })
  );
}

// ══ NAVIGATION ════════════════════════════════════════════

function goScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  document.getElementById(id).classList.add('on');
}

// Main tabs
document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('on'));
    document.getElementById('view-' + currentTab).classList.add('on');
  });
});

// Sub-tabs
document.querySelectorAll('.stab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSub = btn.dataset.sub;
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    ['shopping','todo','chores'].forEach(s => {
      document.getElementById('sub-' + s).classList.toggle('hidden', s !== currentSub);
    });
  });
});

// Back buttons
document.getElementById('proj-back').addEventListener('click', () => {
  currentProjId = null;
  showingReport = false;
  goScreen('screen-main');
});
document.getElementById('chore-back').addEventListener('click', () => {
  currentChoreId = null;
  goScreen('screen-main');
});
document.getElementById('avi-btn').addEventListener('click', () => goScreen('screen-user'));
document.getElementById('user-back').addEventListener('click', () => goScreen('screen-main'));

// ══ GREETING ══════════════════════════════════════════════
function initGreeting() {
  const h = new Date().getHours();
  document.getElementById('greet-text').textContent =
    h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greet-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

// ══ WORK VIEW ═════════════════════════════════════════════
function renderWorkView() {
  const container = document.getElementById('projects-list');
  const empty     = document.getElementById('work-empty');

  if (!projects.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  container.innerHTML = projects.map(proj => {
    const projTasks = tasks.filter(t => t.projectId === proj.id && !t.done);
    const collapsed = proj.collapsed ? 'collapsed' : '';
    const openRows  = projTasks.slice(0, 3).map(t => taskRowHTML(t, false)).join('');

    return `
      <div class="proj-card ${collapsed}" id="pc-${proj.id}">
        <div class="proj-hd" data-proj-toggle="${proj.id}">
          <span class="proj-dot" style="background:${proj.color}"></span>
          <span class="proj-name">${esc(proj.name)}</span>
          <span class="proj-badge">${projTasks.length}</span>
          <button class="proj-open-btn" data-open-proj="${proj.id}">Open →</button>
          <span class="proj-arrow">›</span>
        </div>
        <div class="proj-body">
          ${openRows}
          <div class="add-task-row" data-add-proj="${proj.id}">
            <div class="task-circle"></div><span>Add task…</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // Bind events
  container.querySelectorAll('[data-proj-toggle]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-open-proj]')) return;
      toggleProjectCollapse(el.dataset.projToggle);
    });
  });
  container.querySelectorAll('[data-open-proj]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openProjectDetail(btn.dataset.openProj);
    });
  });
  container.querySelectorAll('[data-task-id]').forEach(row => {
    row.addEventListener('click', () => toggleTaskDone(row.dataset.taskId));
  });
  container.querySelectorAll('[data-add-proj]').forEach(row => {
    row.addEventListener('click', () => openAddTask(row.dataset.addProj));
  });
}

// ══ TASK RENDERING ════════════════════════════════════════
function taskRowHTML(task, showDoneDate = false) {
  const isDone = task.done;
  const chips  = (task.tags || []).map(tag =>
    `<span class="chip c-${tag}">${tagLabel(tag)}</span>`).join('');

  let dueChip = '';
  if (task.due && !isDone) {
    const diff = daysDiff(task.due, today());
    const cls  = diff < 0 ? 'due-late' : diff === 0 ? 'due-today' : 'due-ok';
    const lbl  = diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Today' : fmtDate(task.due);
    dueChip = `<span class="due-chip ${cls}">${lbl}</span>`;
  }

  const doneDateHTML = showDoneDate && task.doneAt
    ? `<span class="done-date">${fmtDate(task.doneAt)}</span>` : '';

  return `
    <div class="task-row ${isDone ? 'done' : ''}" data-task-id="${task.id}">
      <div class="task-circle"></div>
      <div class="task-body">
        <div class="task-name">${esc(task.name)}</div>
        ${task.note ? `<div class="task-note">${esc(task.note)}</div>` : ''}
        ${chips || dueChip ? `<div class="task-chips">${chips}${dueChip}</div>` : ''}
      </div>
      ${doneDateHTML}
    </div>`;
}

async function toggleTaskDone(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const nowDone = !task.done;
  await updateDoc(userDoc('tasks', taskId), {
    done:   nowDone,
    doneAt: nowDone ? today() : null
  });
}

async function toggleProjectCollapse(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  await updateDoc(userDoc('projects', projId), { collapsed: !proj.collapsed });
}

// ══ PROJECT DETAIL ════════════════════════════════════════
function openProjectDetail(projId) {
  currentProjId   = projId;
  showingReport   = false;
  reportMonthOffset = 0;

  document.getElementById('proj-tasks-view').classList.remove('hidden');
  document.getElementById('proj-report-view').classList.add('hidden');
  document.getElementById('proj-view-toggle').textContent = 'Monthly';

  renderProjectDetail(projId);
  goScreen('screen-project');
}

function renderProjectDetail(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  document.getElementById('proj-detail-name').textContent = proj.name;

  const projTasks = tasks.filter(t => t.projectId === projId);
  const open  = projTasks.filter(t => !t.done);
  const done  = projTasks.filter(t => t.done).sort((a,b) => (b.doneAt||'').localeCompare(a.doneAt||''));

  const thisMonth = monthKey(0);
  const doneThisMonth = done.filter(t => (t.doneAt||'').startsWith(thisMonth)).length;

  // Stats
  document.getElementById('proj-stats-row').innerHTML = `
    <div class="pstat"><div class="pstat-n amber">${open.length}</div><div class="pstat-l">Open</div></div>
    <div class="pstat"><div class="pstat-n green">${doneThisMonth}</div><div class="pstat-l">Done this month</div></div>
    <div class="pstat"><div class="pstat-n">${projTasks.length}</div><div class="pstat-l">All tasks</div></div>
  `;

  // Open tasks
  const openList = document.getElementById('proj-open-list');
  openList.innerHTML = open.map(t => taskRowHTML(t, false)).join('') +
    `<div class="add-task-row" id="proj-add-task-row">
       <div class="task-circle"></div><span>Add task…</span>
     </div>`;
  openList.querySelectorAll('[data-task-id]').forEach(row => {
    row.addEventListener('click', () => toggleTaskDone(row.dataset.taskId));
  });
  document.getElementById('proj-add-task-row')
    .addEventListener('click', () => openAddTask(projId));

  // Done tasks
  const doneList = document.getElementById('proj-done-list');
  if (!done.length) {
    doneList.innerHTML = '<div class="list-empty" style="padding:16px 8px">No completed tasks yet.</div>';
    return;
  }

  // Group done by month
  const byMonth = {};
  done.forEach(t => {
    const mk = t.doneAt ? t.doneAt.slice(0,7) : 'unknown';
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(t);
  });

  doneList.innerHTML = Object.entries(byMonth)
    .sort(([a],[b]) => b.localeCompare(a))
    .map(([mk, mTasks]) => {
      const label = mk === 'unknown' ? 'Earlier' : fmtMonthKey(mk);
      return `
        <div class="done-section-toggle open" data-done-group="${mk}">
          <span class="done-toggle-label">${label}</span>
          <span class="done-toggle-count">${mTasks.length}</span>
          <span class="done-toggle-arrow">›</span>
        </div>
        <div id="done-group-${mk}">
          ${mTasks.map(t => taskRowHTML(t, true)).join('')}
        </div>`;
    }).join('');

  doneList.querySelectorAll('[data-task-id]').forEach(row => {
    row.addEventListener('click', () => toggleTaskDone(row.dataset.taskId));
  });
  doneList.querySelectorAll('[data-done-group]').forEach(tog => {
    tog.addEventListener('click', () => {
      const grp = document.getElementById('done-group-' + tog.dataset.doneGroup);
      grp.classList.toggle('hidden');
      tog.classList.toggle('open');
    });
  });
}

// Toggle between tasks / monthly report
document.getElementById('proj-view-toggle').addEventListener('click', () => {
  showingReport = !showingReport;
  document.getElementById('proj-tasks-view').classList.toggle('hidden',  showingReport);
  document.getElementById('proj-report-view').classList.toggle('hidden', !showingReport);
  document.getElementById('proj-view-toggle').textContent = showingReport ? 'Tasks' : 'Monthly';
  if (showingReport) renderMonthlyReport();
});

document.getElementById('month-prev').addEventListener('click', () => {
  reportMonthOffset--;
  renderMonthlyReport();
});
document.getElementById('month-next').addEventListener('click', () => {
  if (reportMonthOffset < 0) { reportMonthOffset++; renderMonthlyReport(); }
});

function renderMonthlyReport() {
  const mk     = monthKey(reportMonthOffset);
  const label  = fmtMonthKey(mk);
  const proj   = projects.find(p => p.id === currentProjId);
  document.getElementById('month-label').textContent  = label;
  document.getElementById('report-title').textContent = `${proj?.name} · ${label}`;
  document.getElementById('month-next').style.opacity = reportMonthOffset < 0 ? '1' : '0.3';

  const doneTasks = tasks
    .filter(t => t.projectId === currentProjId && t.done && (t.doneAt||'').startsWith(mk))
    .sort((a,b) => (b.doneAt||'').localeCompare(a.doneAt||''));

  if (!doneTasks.length) {
    document.getElementById('report-rows').innerHTML =
      '<div class="report-empty">No completed tasks this month.</div>';
    document.getElementById('report-summary').textContent = '';
    return;
  }

  document.getElementById('report-rows').innerHTML = doneTasks.map(t => `
    <div class="report-row">
      <span class="report-check">✓</span>
      <div style="flex:1">
        <div class="report-task-name">${esc(t.name)}</div>
        <div class="report-task-date">${fmtDate(t.doneAt)}</div>
      </div>
    </div>`).join('');

  document.getElementById('report-summary').innerHTML =
    `<strong>${doneTasks.length} task${doneTasks.length > 1 ? 's' : ''} completed</strong> in ${label}.`;
}

document.getElementById('copy-btn').addEventListener('click', () => {
  const mk    = monthKey(reportMonthOffset);
  const proj  = projects.find(p => p.id === currentProjId);
  const done  = tasks.filter(t =>
    t.projectId === currentProjId && t.done && (t.doneAt||'').startsWith(mk)
  ).sort((a,b) => (b.doneAt||'').localeCompare(a.doneAt||''));

  let text = `${proj?.name || 'Project'} — ${fmtMonthKey(mk)} Update\n`;
  text += `Completed (${done.length}):\n`;
  done.forEach(t => { text += `• ${t.name} (${fmtDate(t.doneAt)})\n`; });
  navigator.clipboard?.writeText(text).catch(() => {});
  showToast('Copied to clipboard ✓');
});

// ══ SHOPPING ══════════════════════════════════════════════
function renderShopping() {
  const list  = document.getElementById('shopping-list-items');
  const empty = document.getElementById('shopping-empty');

  if (!shopping.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = shopping.map(item => `
    <div class="shop-row ${item.checked ? 'checked' : ''}" data-shop-id="${item.id}">
      <div class="shop-check"></div>
      <span class="shop-name">${esc(item.name)}</span>
      ${item.qty ? `<span class="shop-qty">${esc(item.qty)}</span>` : ''}
    </div>`).join('');

  list.querySelectorAll('[data-shop-id]').forEach(row => {
    row.addEventListener('click', async () => {
      const item = shopping.find(i => i.id === row.dataset.shopId);
      if (item) await updateDoc(userDoc('shopping', item.id), { checked: !item.checked });
    });
  });
}

// ══ PERSONAL TO-DOs ═══════════════════════════════════════
function renderTodos() {
  const listEl = document.getElementById('todo-open-list');
  const empty  = document.getElementById('todo-empty');
  const open   = todos.filter(t => !t.done);
  const done   = todos.filter(t => t.done).sort((a,b) => (b.doneAt||'').localeCompare(a.doneAt||''));

  if (!todos.length) {
    listEl.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  let html = open.map(t => {
    let dueChip = '';
    if (t.due) {
      const diff = daysDiff(t.due, today());
      const cls  = diff < 0 ? 'due-late' : diff === 0 ? 'due-today' : 'due-ok';
      const lbl  = diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Today' : fmtDate(t.due);
      dueChip = `<span class="due-chip ${cls}">${lbl}</span>`;
    }
    return `
      <div class="task-row" data-todo-id="${t.id}">
        <div class="task-circle"></div>
        <div class="task-body">
          <div class="task-name">${esc(t.name)}</div>
          ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}
          ${dueChip ? `<div class="task-chips">${dueChip}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  if (done.length) {
    html += `
      <div class="done-section-toggle" data-todo-done-toggle>
        <span class="done-toggle-label">Done</span>
        <span class="done-toggle-count">${done.length}</span>
        <span class="done-toggle-arrow">›</span>
      </div>
      <div id="todo-done-list" class="hidden">
        ${done.map(t => `
          <div class="task-row done" data-todo-id="${t.id}">
            <div class="task-circle"></div>
            <div class="task-body"><div class="task-name">${esc(t.name)}</div></div>
            <span class="done-date">${t.doneAt ? fmtDate(t.doneAt) : ''}</span>
          </div>`).join('')}
      </div>`;
  }

  html += `<div class="add-task-row" id="todo-add-row">
    <div class="task-circle"></div><span>Add to-do…</span>
  </div>`;

  listEl.innerHTML = html;

  listEl.querySelectorAll('[data-todo-id]').forEach(row => {
    row.addEventListener('click', () => toggleTodoDone(row.dataset.todoId));
  });
  const toggle = listEl.querySelector('[data-todo-done-toggle]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.getElementById('todo-done-list')?.classList.toggle('hidden');
      toggle.classList.toggle('open');
    });
  }
  document.getElementById('todo-add-row')
    ?.addEventListener('click', () => openSheet('sheet-todo'));
}

async function toggleTodoDone(todoId) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;
  const nowDone = !todo.done;
  await updateDoc(userDoc('todos', todoId), {
    done:   nowDone,
    doneAt: nowDone ? today() : null
  });
}

// ══ CHORES ════════════════════════════════════════════════
function choreStatus(chore) {
  const daysAgo = dateDiffDays(chore.lastDone || today(), today());
  const pct     = Math.min(100, Math.round(daysAgo / chore.freq * 100));
  return {
    daysAgo,
    pct,
    status: pct >= 100 ? 'over' : pct >= 70 ? 'ok' : 'fresh'
  };
}

function renderChores() {
  const container = document.getElementById('chores-list');
  const empty     = document.getElementById('chores-empty');

  if (!chores.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const sorted = [...chores].sort((a,b) => choreStatus(b).pct - choreStatus(a).pct);

  container.innerHTML = sorted.map(c => {
    const { daysAgo, pct, status } = choreStatus(c);
    const since = daysAgo === 0 ? 'Done today' : daysAgo === 1 ? 'Done yesterday' : `${daysAgo} days ago`;
    const freqLabel = freqText(c.freq);
    return `
      <div class="chore-card status-${status}" data-open-chore="${c.id}">
        <div class="chore-top">
          <div class="chore-left">
            <div class="chore-name">${esc(c.name)}</div>
            <div class="chore-freq">${freqLabel}</div>
          </div>
          <button class="chore-done-btn" data-chore-done="${c.id}">Done ✓</button>
        </div>
        <div class="chore-status">
          <span class="chore-since">${since}</span>
          <span class="chore-pct">${pct}%</span>
        </div>
        <div class="chore-bar"><div class="chore-fill" style="width:${pct}%"></div></div>
        <div class="chore-hint">Tap for history & trends →</div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-open-chore]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-chore-done]')) return;
      openChoreDetail(card.dataset.openChore);
    });
  });

  container.querySelectorAll('[data-chore-done]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      markChoreDone(btn.dataset.choreDone);
    });
  });
}

async function markChoreDone(choreId) {
  const chore = chores.find(c => c.id === choreId);
  if (!chore) return;
  const daysAgo = dateDiffDays(chore.lastDone || today(), today());
  const newHistory = [...(chore.history || []), { date: today(), days: daysAgo }].slice(-20);
  await updateDoc(userDoc('chores', choreId), {
    lastDone: today(),
    history:  newHistory
  });
  showToast('Marked done ✓');
}

// ══ CHORE DETAIL ══════════════════════════════════════════
function openChoreDetail(choreId) {
  currentChoreId = choreId;
  renderChoreDetail(choreId);
  goScreen('screen-chore');
}

function renderChoreDetail(choreId) {
  const chore = chores.find(c => c.id === choreId);
  if (!chore) return;

  const { daysAgo, pct, status } = choreStatus(chore);
  const history = chore.history || [];
  const intervals = history.map(h => h.days).filter(d => d > 0);

  // Header
  document.getElementById('chore-detail-name').textContent = chore.name;
  document.getElementById('chore-hero-name').textContent   = chore.name;

  const overBy = daysAgo - chore.freq;
  const subText = status === 'over'
    ? `Every ${chore.freq}d · overdue by ${overBy} day${overBy !== 1 ? 's' : ''}`
    : status === 'ok'
    ? `Every ${chore.freq}d · due soon`
    : `Every ${chore.freq}d · done ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
  document.getElementById('chore-hero-sub').textContent = subText;

  // Stats
  const streak = calcStreak(history, chore.freq);
  const avg    = intervals.length
    ? Math.round(intervals.reduce((a,b) => a+b, 0) / intervals.length)
    : chore.freq;
  document.getElementById('chore-stats-row').innerHTML = `
    <div class="cstat">
      <div class="cstat-n ${streak >= 5 ? 'green' : streak >= 2 ? 'amber' : 'red'}">${streak}</div>
      <div class="cstat-l">On-time streak</div>
    </div>
    <div class="cstat">
      <div class="cstat-n amber">${avg}d</div>
      <div class="cstat-l">Avg. interval</div>
    </div>
    <div class="cstat">
      <div class="cstat-n">${history.length}</div>
      <div class="cstat-l">Times done</div>
    </div>
  `;

  // Chart
  setTimeout(() => drawTrendChart(intervals.slice(-8), chore.freq), 60);

  // Heatmap — last 12 weeks
  const heatmap = buildHeatmap(history, 12);
  document.getElementById('heatmap-grid').innerHTML =
    heatmap.map(v => `<div class="hm-cell hm-${v}"></div>`).join('');

  // Log
  const logEl = document.getElementById('chore-log');
  if (!history.length) {
    logEl.innerHTML = '<div class="list-empty" style="padding:16px">No history yet — mark it done to start tracking.</div>';
    return;
  }
  logEl.innerHTML = [...history].reverse().map(h => {
    const late  = h.days - chore.freq;
    const isOk  = late <= 0;
    const isOvr = late > 2;
    const icon  = isOk ? '✅' : isOvr ? '🔴' : '🟡';
    const cls   = isOk ? 'log-ok' : isOvr ? 'log-over' : 'log-late';
    const label = isOk ? 'on time' : `+${late}d late`;
    const dc    = isOk ? 'good' : isOvr ? 'bad' : 'warn';
    return `
      <div class="log-row">
        <div class="log-icon ${cls}">${icon}</div>
        <div class="log-body">
          <div class="log-date">${fmtDate(h.date)}</div>
          <div class="log-sub">${h.days} day${h.days !== 1 ? 's' : ''} since last</div>
        </div>
        <span class="log-status ${dc}">${label}</span>
      </div>`;
  }).join('');
}

function drawTrendChart(intervals, target) {
  const canvas = document.getElementById('trend-canvas');
  const rect   = canvas.getBoundingClientRect();
  const dpr    = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
  canvas.height = 100 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width, H = 100;
  if (!intervals.length) {
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.font = '12px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Complete this chore a few times to see trends', W/2, H/2);
    return;
  }

  const pad  = { l:28, r:8, t:10, b:18 };
  const cw   = W - pad.l - pad.r;
  const ch   = H - pad.t - pad.b;
  const max  = Math.max(...intervals, target) + 3;
  const n    = intervals.length;
  const xStep = n > 1 ? cw / (n-1) : cw;
  const fy   = v => pad.t + ch - (v / max) * ch;

  // Target line
  const ty = fy(target);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.setLineDash([4,4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, ty); ctx.lineTo(W - pad.r, ty); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(target + 'd', 2, ty + 3);

  const pts = intervals.map((v, i) => ({
    x: n > 1 ? pad.l + i * xStep : pad.l + cw / 2,
    y: fy(v)
  }));

  // Area fill
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H - pad.b);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H - pad.b);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  g.addColorStop(0, 'rgba(139,127,250,.3)');
  g.addColorStop(1, 'rgba(139,127,250,0)');
  ctx.fillStyle = g; ctx.fill();

  // Line
  if (n > 1) {
    ctx.strokeStyle = '#8B7FFA'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }

  // Dots
  pts.forEach((p, i) => {
    const v = intervals[i];
    const c = v > target ? '#FF7070' : v > target * .75 ? '#FFAD3A' : '#2EE89A';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.fill();
    ctx.strokeStyle = '#1E1E24'; ctx.lineWidth = 1.5; ctx.stroke();
  });

  // X labels
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.font = '8px Inter,sans-serif'; ctx.textAlign = 'center';
  pts.forEach((p, i) => ctx.fillText(i + 1, p.x, H - 3));
}

function buildHeatmap(history, weeks) {
  const cells = new Array(weeks).fill(0);
  const now   = new Date();
  history.forEach(h => {
    const d    = new Date(h.date + 'T00:00:00');
    const diff = Math.floor((now - d) / (7 * 86400000));
    const idx  = weeks - 1 - diff;
    if (idx >= 0 && idx < weeks) cells[idx] = Math.min(3, cells[idx] + 1);
  });
  return cells;
}

function calcStreak(history, freq) {
  if (!history.length) return 0;
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].days <= freq + 1) streak++;
    else break;
  }
  return streak;
}

// ══ ADD FLOWS — SHEETS ════════════════════════════════════

// Work FAB
document.getElementById('work-fab').addEventListener('click', () => {
  if (!projects.length) { openSheet('sheet-project'); return; }
  openAddTask(projects[0]?.id);
});

// Personal FAB
document.getElementById('personal-fab').addEventListener('click', () => {
  if (currentSub === 'shopping') openSheet('sheet-item');
  else if (currentSub === 'todo') openSheet('sheet-todo');
  else openSheet('sheet-chore');
});

// Project FAB
document.getElementById('proj-fab').addEventListener('click', () => openAddTask(currentProjId));

// New project
document.getElementById('new-proj-btn').addEventListener('click', () => openSheet('sheet-project'));

document.getElementById('save-proj-btn').addEventListener('click', async () => {
  const name = document.getElementById('proj-name-input').value.trim();
  if (!name) return;
  closeSheet('sheet-project');
  await setDoc(doc(userCol('projects'), newId()), {
    name, color: selectedColor, collapsed: false,
    createdAt: serverTimestamp()
  });
  document.getElementById('proj-name-input').value = '';
  showToast(`"${name}" created`);
});

// Task sheet
let addTaskProjId = null;
function openAddTask(projId) {
  addTaskProjId = projId;
  // Populate project dropdown
  const sel = document.getElementById('task-project-select');
  sel.innerHTML = projects.map(p =>
    `<option value="${p.id}" ${p.id === projId ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  document.getElementById('task-name-input').value  = '';
  document.getElementById('task-due-input').value   = '';
  document.getElementById('task-note-input').value  = '';
  document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
  openSheet('sheet-task');
  setTimeout(() => document.getElementById('task-name-input').focus(), 350);
}

document.getElementById('save-task-btn').addEventListener('click', async () => {
  const name  = document.getElementById('task-name-input').value.trim();
  if (!name) return;
  const projId = document.getElementById('task-project-select').value;
  const tags   = [...document.querySelectorAll('.tag-pill.active')].map(p => p.dataset.tag);
  closeSheet('sheet-task');
  await setDoc(doc(userCol('tasks'), newId()), {
    name, projectId: projId, tags,
    due:   document.getElementById('task-due-input').value || null,
    note:  document.getElementById('task-note-input').value.trim() || null,
    done:  false, doneAt: null,
    createdAt: serverTimestamp()
  });
  showToast(`Task added`);
});

// Shopping item
document.getElementById('save-item-btn').addEventListener('click', async () => {
  const name = document.getElementById('item-name-input').value.trim();
  if (!name) return;
  closeSheet('sheet-item');
  await setDoc(doc(userCol('shopping'), newId()), {
    name,
    qty:     document.getElementById('item-qty-input').value.trim() || null,
    checked: false,
    createdAt: serverTimestamp()
  });
  document.getElementById('item-name-input').value = '';
  document.getElementById('item-qty-input').value  = '';
  showToast('Item added');
});

// Personal todo
document.getElementById('save-todo-btn').addEventListener('click', async () => {
  const name = document.getElementById('todo-name-input').value.trim();
  if (!name) return;
  closeSheet('sheet-todo');
  await setDoc(doc(userCol('todos'), newId()), {
    name,
    due:  document.getElementById('todo-due-input').value || null,
    note: document.getElementById('todo-note-input').value.trim() || null,
    done: false, doneAt: null,
    createdAt: serverTimestamp()
  });
  document.getElementById('todo-name-input').value  = '';
  document.getElementById('todo-due-input').value   = '';
  document.getElementById('todo-note-input').value  = '';
  showToast('To-do added');
});

// Chore
document.getElementById('chore-last-input').value = today();
document.getElementById('save-chore-btn').addEventListener('click', async () => {
  const name = document.getElementById('chore-name-input').value.trim();
  if (!name) return;
  closeSheet('sheet-chore');
  await setDoc(doc(userCol('chores'), newId()), {
    name,
    freq:     parseInt(document.getElementById('chore-freq-select').value),
    lastDone: document.getElementById('chore-last-input').value || today(),
    history:  [],
    createdAt: serverTimestamp()
  });
  document.getElementById('chore-name-input').value = '';
  showToast('Chore added');
});

// ══ SHEET MECHANICS ═══════════════════════════════════════
function openSheet(id) {
  document.querySelectorAll('.sheet-overlay').forEach(o => o.classList.remove('open'));
  document.getElementById(id).classList.add('open');
}
function closeSheet(id) {
  document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('.sheet-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.sheet-overlay.open').forEach(o => o.classList.remove('open'));
});

// Tag pills
document.querySelectorAll('.tag-pill').forEach(p => {
  p.addEventListener('click', () => p.classList.toggle('active'));
});

// Color swatches
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    selectedColor = dot.dataset.color;
  });
});

// Enter to submit
[
  ['task-name-input',  'save-task-btn'],
  ['proj-name-input',  'save-proj-btn'],
  ['item-name-input',  'save-item-btn'],
  ['todo-name-input',  'save-todo-btn'],
  ['chore-name-input', 'save-chore-btn'],
].forEach(([inputId, btnId]) => {
  document.getElementById(inputId)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById(btnId)?.click();
  });
});

// ══ TOAST ═════════════════════════════════════════════════
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ══ DATE UTILS ════════════════════════════════════════════
function monthKey(offset) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0,7);
}
function fmtMonthKey(mk) {
  const [y,m] = mk.split('-');
  return new Date(+y, +m-1, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'});
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
function daysDiff(a, b) {
  // positive = a is in the future vs b
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((da - db) / 86400000);
}
function dateDiffDays(from, to) {
  return Math.max(0, Math.round(
    (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000
  ));
}
function freqText(freq) {
  if (freq === 1)  return 'Daily';
  if (freq === 7)  return 'Weekly';
  if (freq === 14) return 'Every 2 weeks';
  if (freq === 30) return 'Monthly';
  return `Every ${freq} days`;
}
function tagLabel(tag) {
  return tag === 'followup' ? 'Follow-up' : tag.charAt(0).toUpperCase() + tag.slice(1);
}
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
