// --- Vendor & styles ---
import 'bootstrap/dist/css/bootstrap.min.css';
import { Modal, Collapse, Tab } from 'bootstrap';
import './style.scss';

// --- Firebase / Firestore ---
import {
  auth, db,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  doc, setDoc, updateDoc, addDoc, deleteDoc, collection, onSnapshot, serverTimestamp,
  query, orderBy, signOut, getDocs
} from './firebaseConfig.js';

import { calculatePriority, calculateUrgency, calculateSlackMargin } from './priority.js';
import { isoWeekId, buildIsoHourForCell } from './calendarHelpers.js';

/* ==========================================================
   Calendar grid setup
   ========================================================== */
function buildCalendarGrid() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const saved = JSON.parse(localStorage.getItem('calendarData') || '{}');

  const hours = Array.from({ length: 24 }, (_, i) => (i + 7) % 24);

  const fmt = (h) => `${(h % 12 === 0 ? 12 : h % 12)} ${h < 12 ? 'AM' : 'PM'}`;

  grid.innerHTML =
    `<div class="corner-cell"></div>${days.map(d => `<div class="day-header">${d}</div>`).join('')}`;

  hours.forEach(h => {
    grid.insertAdjacentHTML('beforeend', `<div class="hour-label">${fmt(h)}</div>`);
    days.forEach(d => {
      const key = `${d}-${h}`;
      const isAvailable = !!saved[key];
      grid.insertAdjacentHTML(
        'beforeend',
        `<div class="time-slot ${isAvailable ? 'available' : ''}" data-key="${key}"></div>`
      );
    });
  });
}


/* ==========================================================
   State
   ========================================================== */
const state = {
  tasks: [],
  availSlots: new Set(),
  events: []
};

/* ==========================================================
   Utility: availability & priority
   ========================================================== */
function intersectsHour(hourIso, start, end) {
  const hStart = new Date(hourIso);
  const hEnd = new Date(hStart.getTime() + 3600000);
  return start < hEnd && end > hStart;
}

function availableHoursUntil(dueDateStr) {
  const now = new Date();
  const due = new Date(`${dueDateStr}T23:59:59`);
  if (Number.isNaN(due.getTime()) || due <= now) return 0;

  let count = 0;
  for (const iso of state.availSlots) {
    const h = new Date(iso);
    if (h >= now && h <= due) {
      const blocked = state.events.some(ev => intersectsHour(iso, ev.start, ev.end));
      if (!blocked) count++;
    }
  }
  return count;
}

function priorityForTask(task) {
  const timeAvail = availableHoursUntil(task.dueDate);
  const margin = calculateSlackMargin(task.timeNeeded, timeAvail);
  const urgency = calculateUrgency(margin);
  const score = calculatePriority(urgency, task.importance ?? 3);
  return { timeAvail, margin, urgency, score };
}

/* ==========================================================
   Real-time Firestore listeners
   ========================================================== */
function startRealtime(uid) {
  onSnapshot(collection(db, 'users', uid, 'tasks'), (snap) => {
    state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
  });

  const now = Date.now();
  const weeks = [isoWeekId(new Date(now)), isoWeekId(new Date(now + 7 * 86400000))];

  weeks.forEach(weekId => {
    onSnapshot(doc(db, 'users', uid, 'weeks', weekId), (d) => {
      for (const k of Array.from(state.availSlots)) if (k.startsWith(weekId)) state.availSlots.delete(k);
      const slots = d.exists() ? (d.data().slots || {}) : {};
      Object.keys(slots).forEach(k => { if (slots[k]) state.availSlots.add(k); });
      renderTasks();
    });
  });

  onSnapshot(query(collection(db, 'users', uid, 'events'), orderBy('start', 'asc')), (snap) => {
    state.events = snap.docs.map(d => {
      const { start, end, title } = d.data();
      return {
        title,
        start: start?.toDate ? start.toDate() : new Date(start),
        end: end?.toDate ? end.toDate() : new Date(end)
      };
    });
    renderTasks();
  });
}

/* ==========================================================
   Rendering: task list
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

    const card = document.createElement('div');
    card.className = 'col-12 col-md-6 col-lg-4';
    card.innerHTML = `
      <div class="card shadow-sm border-0 border-start border-4 ${color}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="card-title mb-0 ${t.completed ? 'text-decoration-line-through' : ''}">${t.name}</h5>
            <span class="badge ${color.replace('border', 'bg')} text-light">${t.importance ?? 3}/5</span>
          </div>
          <p class="mb-1"><strong>Due:</strong> ${date}</p>
          <p class="mb-1"><strong>Study hrs left:</strong> ${p.timeAvail.toFixed(0)}</p>
          <p class="mb-2"><strong>Slack ratio:</strong> ${p.margin.toFixed(2)}</p>
          <div class="d-flex justify-content-between">
            <button class="btn btn-sm ${t.completed ? 'btn-secondary' : 'btn-success'} toggle-complete">
              ${t.completed ? 'Undo' : 'Complete'}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
          </div>
        </div>
      </div>`;

    card.querySelector('.toggle-complete')?.addEventListener('click', async () => {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', t.id), { completed: !t.completed });
    });
    card.querySelector('.delete-task')?.addEventListener('click', async () => {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', t.id));
    });

    list.appendChild(card);
  });
}

/* ==========================================================
   Main UI setup
   ========================================================== */
window.addEventListener('DOMContentLoaded', () => {
  buildCalendarGrid();

  const emailEl = document.getElementById('currentUserEmail');
  const logoutBtn = document.getElementById('logoutBtn');
  const deleteInfoBtn = document.getElementById('deleteInfoBtn');
  const confirmModalEl = document.getElementById('confirmDelete');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const confirmModal = confirmModalEl ? Modal.getOrCreateInstance(confirmModalEl) : null;

  const loginModalEl = document.getElementById('loginModal');
  const loginModal = loginModalEl ? Modal.getOrCreateInstance(loginModalEl) : null;

  // Auth state listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (emailEl) emailEl.textContent = user.email || '(no email)';
      loginModal?.hide();
      startRealtime(user.uid);
    } else {
      if (emailEl) emailEl.textContent = '—';
      loginModal?.show();
    }
  });

  // Login form
  document.querySelector('#loginModal form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    const pw = document.getElementById('password')?.value || '';
    if (!email || !pw) return;
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        await createUserWithEmailAndPassword(auth, email, pw);
      } else console.error('[AUTH]', err);
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[AUTH] signOut failed:', err);
    }
  });

  // --- Delete account info ---
  deleteInfoBtn?.addEventListener('click', () => {
    confirmModal?.show();
  });

  confirmBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    try {
      await deleteUserData(user.uid);
      localStorage.removeItem('calendarData');
      confirmModal?.hide();
      alert('Your account info has been deleted.');
    } catch (err) {
      console.error('[DATA] delete failed:', err);
      alert('Failed to delete account info.');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, delete';
    }
  });

  async function deleteUserData(uid) {
    const subs = ['tasks', 'events', 'weeks'];
    for (const name of subs) {
      const colRef = collection(db, 'users', uid, name);
      const snap = await getDocs(colRef);
      const deletions = snap.docs.map(d => deleteDoc(doc(db, 'users', uid, name, d.id)));
      await Promise.all(deletions);
    }
    await deleteDoc(doc(db, 'users', uid));
  }

  // Calendar clicks
  document.getElementById('calendar')?.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('time-slot')) return;

    target.classList.toggle('available');
    const key = target.dataset.key;
    if (!key) return;
    const [dLabel, hStr] = key.split('-');
    const isAvailable = target.classList.contains('available');

    const saved = JSON.parse(localStorage.getItem('calendarData') || '{}');
    saved[key] = isAvailable;
    localStorage.setItem('calendarData', JSON.stringify(saved));

    const user = auth.currentUser;
    if (user) {
      const isoHour = buildIsoHourForCell(dLabel, parseInt(hStr, 10));
      const weekId = isoWeekId(new Date(isoHour));
      await setDoc(doc(db, 'users', user.uid, 'weeks', weekId), {
        weekStart: weekId,
        ['slots.' + isoHour]: isAvailable ? true : null
      }, { merge: true });
    }
  });

  // Event form
  document.getElementById('eventForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('eventTitle')?.value.trim() || 'Event';
    const startVal = document.getElementById('eventStart')?.value;
    const endVal = document.getElementById('eventEnd')?.value;
    if (!startVal || !endVal) return;

    const start = new Date(startVal);
    const end = new Date(endVal);
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'users', user.uid, 'events'), {
      title, start, end, kind: 'custom', createdAt: serverTimestamp()
    });

    const modalEl = document.getElementById('eventModal');
    if (modalEl) Modal.getOrCreateInstance(modalEl).hide();
    e.target.reset();
  });

  // Task form
  document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('taskName')?.value.trim();
    const dueDate = document.getElementById('dueDate')?.value;
    const timeNeeded = parseFloat(document.getElementById('timeNeeded')?.value || 'NaN');
    const importance = parseInt(document.getElementById('importance')?.value || '3', 10);
    if (!name || !dueDate || Number.isNaN(timeNeeded)) return;

    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'users', user.uid, 'tasks'), {
      name, dueDate, timeNeeded, importance, completed: false, createdAt: serverTimestamp()
    });

    e.target.reset();
    const collapse = document.getElementById('taskFormCollapse');
    if (collapse) Collapse.getOrCreateInstance(collapse).hide();
  });
});
