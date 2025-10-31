// --- Vendor & styles ---
import 'bootstrap/dist/css/bootstrap.min.css';
import { Modal, Collapse, Tab } from 'bootstrap';
import './style.scss';

// --- Firebase / Firestore ---
// Note: only import things that you already export from firebaseConfig.js
import {
  auth, db,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  doc, setDoc, updateDoc, addDoc, deleteDoc, collection, onSnapshot, serverTimestamp,
  query, orderBy, getDocs, deleteField
} from './services/firebaseConfig.js';

import { calculatePriority, calculateUrgency, calculateSlackMargin } from './priority.js';
import { isoWeekId, buildIsoHourForCell } from './calendar/helpers.js';

/* ==========================================================
   Calendar constants (7 AM -> 12 AM)
   ========================================================== */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 17 }, (_, i) => 7 + i); // 7..23
const fmtHour = (h) => `${(h % 12 === 0 ? 12 : h % 12)} ${h < 12 ? 'AM' : 'PM'}`;

/* ==========================================================
   State
   ========================================================== */
const state = {
  tasks: [],
  eventsAll: [],       // all events (we'll filter to visible week)
  studyAll: [],        // all study blocks (filter to visible week)
  studyBlocks: [],     // visible week only
  events: [],          // visible week only
  availSlots: new Set(),
  clockOffsetMs: 0,    // left at 0 (no server clock in this hotfix)
  weekOffset: 0
};

function now() { return new Date(Date.now() + (state.clockOffsetMs || 0)); }

// local week helpers (week starts Monday)
function startOfWeekLocal(d = now()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d, n) { return addDays(d, n * 7); }
function visibleWeekRange() {
  const start = addWeeks(startOfWeekLocal(), state.weekOffset);
  const end = addDays(start, 7);
  return { start, end };
}
function weekTitleText() {
  const { start, end } = visibleWeekRange();
  const opt = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opt)} – ${addDays(end, -1).toLocaleDateString(undefined, opt)}`;
}

/* ==========================================================
   Build calendar grid
   ========================================================== */
function buildCalendarGrid() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarWeekTitle');
  if (!grid) return;

  const { start } = visibleWeekRange();
  const dayLabels = DAYS.map((d, i) => {
    const dt = addDays(start, i);
    const md = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="day-header"><div>${d}</div><small class="text-muted">${md}</small></div>`;
  });

  grid.innerHTML = `<div class="corner-cell"></div>${dayLabels.join('')}`;

  HOURS.forEach(h => {
    grid.insertAdjacentHTML('beforeend', `<div class="hour-label">${fmtHour(h)}</div>`);
    DAYS.forEach(d => {
      const key = `${d}-${h}`;
      grid.insertAdjacentHTML('beforeend', `<div class="time-slot" data-key="${key}"></div>`);
    });
  });

  if (title) title.textContent = weekTitleText();
}

/* ==========================================================
   Hydrate grid (merged study blocks + busy events)
   ========================================================== */
function hydrateCalendarFromState() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  // clear old labels
  grid.querySelectorAll('.time-slot .study-label').forEach(n => n.remove());

  const { start: weekStart } = visibleWeekRange();

  for (let di = 0; di < DAYS.length; di++) {
    for (const h of HOURS) {
      const key = `${DAYS[di]}-${h}`;
      const el = grid.querySelector(`.time-slot[data-key="${key}"]`);
      if (!el) continue;

      // hour window for the currently displayed week
      const slotStart = new Date(weekStart);
      slotStart.setDate(weekStart.getDate() + di);
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

      const inStudy = state.studyBlocks.some(b => b.start < slotEnd && b.end > slotStart);
      const hasEvent = state.events.some(ev => ev.start < slotEnd && ev.end > slotStart);

      el.classList.toggle('study', inStudy);
      el.classList.toggle('busy', hasEvent);

      if (inStudy) {
        const lab = document.createElement('span');
        lab.className = 'study-label';
        lab.innerHTML = 'Study<br>time';   // 2-line label
        lab.title = 'Study time';
        el.appendChild(lab);
      }
    }
  }
}



/* ==========================================================
   Filter all-doc snapshots to the visible week
   ========================================================== */
function refilterVisibleWeek() {
  const { start, end } = visibleWeekRange();
  state.events = state.eventsAll.filter(ev => ev.start < end && ev.end > start);
  state.studyBlocks = state.studyAll.filter(b => b.start < end && b.end > start);
  hydrateCalendarFromState();
  renderTasks();
}


function hourWindowForCell(dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange();
  const dayIndex = DAYS.indexOf(dayLabel); // 0..6 (Mon..Sun)
  if (dayIndex < 0) throw new Error(`Bad day label: ${dayLabel}`);

  const slotStart = new Date(weekStart);
  slotStart.setDate(weekStart.getDate() + dayIndex);
  slotStart.setHours(hour24, 0, 0, 0);

  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  return { start: slotStart, end: slotEnd };
}


async function toggleStudyHour(dayLabel, hour24) {
  const user = auth.currentUser;
  if (!user) return;

  const { start, end } = hourWindowForCell(dayLabel, hour24);

  const existing = state.studyBlocks.find(
    b => b.start.getTime() === start.getTime() && b.end.getTime() === end.getTime()
  );

  if (existing) {
    await deleteDoc(doc(db, 'users', user.uid, 'studyBlocks', existing.id));
    return;
  }

  await addDoc(collection(db, 'users', user.uid, 'studyBlocks'), {
    title: 'Study',
    start,
    end,
    createdAt: serverTimestamp()
  });
}



/* ==========================================================
   Priority math (uses committed study time)
   ========================================================== */
function overlapMs(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart.getTime(), bStart.getTime());
  const e = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, e - s);
}
function studyMinutesUntil(dueDateStr) {
  const n = now();
  const due = new Date(`${dueDateStr}T23:59:59`);
  if (Number.isNaN(due.getTime()) || due <= n) return 0;

  let minutes = 0;
  for (const block of state.studyBlocks) {
    const segStart = new Date(Math.max(block.start.getTime(), n.getTime()));
    const segEnd = new Date(Math.min(block.end.getTime(), due.getTime()));
    if (segEnd <= segStart) continue;

    let busyMs = 0;
    for (const ev of state.events) busyMs += overlapMs(segStart, segEnd, ev.start, ev.end);
    const freeMs = Math.max(0, (segEnd - segStart) - busyMs);
    minutes += freeMs / 60000;
  }
  return minutes;
}
function priorityForTask(task) {
  const studyMins = studyMinutesUntil(task.dueDate);
  const timeAvail = studyMins / 60;
  const margin = calculateSlackMargin(task.timeNeeded, timeAvail);
  const urgency = calculateUrgency(margin);
  const score = calculatePriority(urgency, task.importance ?? 3);
  return { timeAvail, margin, urgency, score };
}

/* ==========================================================
   Rendering: task cards
   ========================================================== */
function renderTasks() {
  const list = document.getElementById('taskList');
  const emptyMsg = document.getElementById('noTasksMsg');
  if (!list) return;

  const scored = state.tasks
    .map(t => ({ t, p: priorityForTask(t) }))
    .sort((a, b) => b.p.score - a.p.score);

  list.innerHTML = '';
  if (emptyMsg) emptyMsg.classList.toggle('visible', scored.length === 0);

  scored.forEach(({ t, p }) => {
    const due = new Date(t.dueDate);
    const date = isNaN(due) ? '—' : due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const urgency = p.urgency;
    const color =
      urgency >= 5 ? 'border-danger' :
        urgency >= 3 ? 'border-warning' : 'border-success';

    const col = document.createElement('div');
    col.className = 'col-12 col-md-6 col-lg-4';
    col.innerHTML = `
      <div class="card shadow-sm border-0 border-start border-4 ${color}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="card-title mb-0 ${t.completed ? 'text-decoration-line-through' : ''}">${t.name}</h5>
            <span class="badge ${color.replace('border', 'bg')} text-light">${t.importance ?? 3}/5</span>
          </div>
          <p class="mb-1"><strong>Due:</strong> ${date}</p>
          <p class="mb-1"><strong>Study hrs left:</strong> ${p.timeAvail.toFixed(1)}</p>
          <p class="mb-2"><strong>Slack ratio:</strong> ${p.margin.toFixed(2)}</p>
          <div class="d-flex justify-content-between">
            <button class="btn btn-sm ${t.completed ? 'btn-secondary' : 'btn-success'} toggle-complete">
              ${t.completed ? 'Undo' : 'Complete'}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
          </div>
        </div>
      </div>`;

    col.querySelector('.toggle-complete')?.addEventListener('click', async () => {
      const u = auth.currentUser; if (!u) return;
      await updateDoc(doc(db, 'users', u.uid, 'tasks', t.id), { completed: !t.completed });
    });
    col.querySelector('.delete-task')?.addEventListener('click', async () => {
      const u = auth.currentUser; if (!u) return;
      await deleteDoc(doc(db, 'users', u.uid, 'tasks', t.id));
    });

    list.appendChild(col);
  });
}

/* ==========================================================
   Auth-gated tabs helper
   ========================================================== */
function setAuthUI(isAuthed) {
  const calendarTabBtn = document.querySelector('#calendar-tab');
  const settingsTabBtn = document.querySelector('#settings-tab');
  const homeTabBtn = document.querySelector('#home-tab');

  const setDisabled = (btn, disabled) => {
    if (!btn) return;
    btn.classList.toggle('disabled', disabled);
    btn.setAttribute('aria-disabled', String(disabled));
    btn.tabIndex = disabled ? -1 : 0;
    const clickBlocker = (e) => e.preventDefault();
    if (disabled) btn.addEventListener('click', clickBlocker, { once: true });
  };

  setDisabled(calendarTabBtn, !isAuthed);
  setDisabled(settingsTabBtn, !isAuthed);
  setDisabled(homeTabBtn, false);

  if (!isAuthed && homeTabBtn) {
    Tab.getOrCreateInstance(homeTabBtn).show();
  }
}

/* ==========================================================
   UI setup + forms
   ========================================================== */
window.addEventListener('DOMContentLoaded', () => {
  const homeTabBtn = document.querySelector('#home-tab');
  if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();

  document.getElementById('authPanel')?.classList.remove('d-none');
  document.getElementById('homeApp')?.classList.add('d-none');

  // Week navigation
  document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
    state.weekOffset -= 1;
    buildCalendarGrid();
    refilterVisibleWeek();
  });
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
    state.weekOffset += 1;
    buildCalendarGrid();
    refilterVisibleWeek();
  });

  // Build grid once
  buildCalendarGrid();
  hydrateCalendarFromState();

  // Inline Log In
  const authEmailEl = document.getElementById('authEmail');
  const pwEl = document.getElementById('authPassword');
  const errBox = document.getElementById('authError');
  const clearAuthError = () => { if (errBox) errBox.textContent = ''; };
  const showAuthError = (m) => { if (errBox) errBox.textContent = m || 'Authentication error. Please try again.'; };

  document.getElementById('doLogin')?.addEventListener('click', async () => {
    const email = authEmailEl?.value?.trim();
    const pw = pwEl?.value || '';
    if (!email || !pw) return;
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      clearAuthError();
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        try { await createUserWithEmailAndPassword(auth, email, pw); clearAuthError(); return; }
        catch (e2) { showAuthError(prettyAuthError(e2)); }
      } else {
        showAuthError(prettyAuthError(err));
      }
    }
  });

  // Sign Up
  const suEmailEl = document.getElementById('suEmail');
  const suPwEl = document.getElementById('suPassword');
  const suPw2El = document.getElementById('suPassword2');
  const suErrBox = document.getElementById('signupError');

  document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = suEmailEl?.value?.trim();
    const pw = suPwEl?.value || '';
    const pw2 = suPw2El?.value || '';
    if (!email || !pw || !pw2) return;
    if (pw !== pw2) { if (suErrBox) suErrBox.textContent = 'Passwords do not match.'; return; }

    try {
      await createUserWithEmailAndPassword(auth, email, pw);
      if (suErrBox) suErrBox.textContent = '';
      const signupModalEl = document.getElementById('signupModal');
      if (signupModalEl) Modal.getOrCreateInstance(signupModalEl).hide();
      e.target.reset();
    } catch (err) {
      if (suErrBox) suErrBox.textContent = prettyAuthError(err);
    }
  });

  // Auth state
  const userEmailEl = document.getElementById('currentUserEmail');

  onAuthStateChanged(auth, async (user) => {
    const authPanel = document.getElementById('authPanel');
    const homeApp = document.getElementById('homeApp');

    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (userEmailEl) userEmailEl.textContent = user.email || '(no email)';

      authPanel?.classList.add('d-none');
      homeApp?.classList.remove('d-none');

      setAuthUI(true);

      // Real-time: tasks (all)
      onSnapshot(collection(db, 'users', user.uid, 'tasks'), (snap) => {
        state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTasks();
      });

      // Real-time: events (all, then client-filter to visible)
      onSnapshot(query(collection(db, 'users', user.uid, 'events'), orderBy('start', 'asc')), (snap) => {
        state.eventsAll = snap.docs.map(d => {
          const { start, end, title } = d.data();
          return {
            title: title || 'Event',
            start: start?.toDate ? start.toDate() : new Date(start),
            end: end?.toDate ? end.toDate() : new Date(end)
          };
        });
        refilterVisibleWeek();
      });

      // Real-time: study blocks (all, then client-filter to visible)
      onSnapshot(query(collection(db, 'users', user.uid, 'studyBlocks'), orderBy('start', 'asc')), (snap) => {
        state.studyAll = snap.docs.map(d => {
          const { start, end, title } = d.data();
          return {
            id: d.id,
            title: title || 'Study',
            start: start?.toDate ? start.toDate() : new Date(start),
            end: end?.toDate ? end.toDate() : new Date(end)
          };
        });
        refilterVisibleWeek();
      });

    } else {
      if (userEmailEl) userEmailEl.textContent = '—';
      authPanel?.classList.remove('d-none');
      homeApp?.classList.add('d-none');
      setAuthUI(false);
      if (homeTabBtn) Tab.getOrCreateInstance(homeTabBtn).show();
    }
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await signOut(auth); } catch (err) { console.error('[AUTH] signOut failed:', err); }
  });

  // Delete account data
  document.getElementById('deleteInfoBtn')?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteUserData(user.uid);
      alert('Your account info has been deleted.');
    } catch (err) {
      console.error('[DATA] delete failed:', err);
      alert('Failed to delete account info.');
    }
  });

  async function deleteUserData(uid) {
    const subs = ['tasks', 'events', 'weeks', 'studyBlocks', 'baseSchedule', 'meta'];
    for (const name of subs) {
      const colRef = collection(db, 'users', uid, name);
      const snap = await getDocs(colRef);
      const deletions = snap.docs.map(d => deleteDoc(doc(db, 'users', uid, name, d.id)));
      await Promise.all(deletions);
    }
    await deleteDoc(doc(db, 'users', uid));
  }

  // Calendar click → toggle study hour
  document.getElementById('calendar')?.addEventListener('click', async (e) => {
    const cell = e.target.closest?.('.time-slot');
    if (!cell) return;
    const key = cell.dataset.key;
    if (!key) return;
    const [dLabel, hStr] = key.split('-');
    const hour24 = parseInt(hStr, 10);
    try {
      await toggleStudyHour(dLabel, hour24);
    } catch (err) {
      console.error('[CAL] toggle hour failed:', err);
    }
  });

  // Task form
  document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('taskName')?.value?.trim() || '';
    const dueDate = document.getElementById('dueDate')?.value || '';
    const timeNeededRaw = document.getElementById('timeNeeded')?.value || '';
    const timeNeeded = parseFloat(timeNeededRaw);
    const importance = parseInt(document.getElementById('importance')?.value || '3', 10);

    if (!name || !dueDate || Number.isNaN(timeNeeded)) return;

    const u = auth.currentUser; if (!u) return;
    await addDoc(collection(db, 'users', u.uid, 'tasks'), {
      name, dueDate, timeNeeded, importance, completed: false, createdAt: serverTimestamp()
    });

    e.target.reset();

    const collapse = document.getElementById('taskFormCollapse');
    if (collapse) Collapse.getOrCreateInstance(collapse).hide();
  });

});

/* ==========================================================
   Error prettifier
   ========================================================== */
function prettyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-email')) return 'Please enter a valid email.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('email-already-in-use')) return 'That email is already registered. Try logging in.';
  if (code.includes('wrong-password')) return 'Incorrect password.';
  if (code.includes('user-not-found')) return 'No account found with that email.';
  return 'Authentication error. Please try again.';
}
