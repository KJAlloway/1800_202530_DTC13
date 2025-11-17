// features/tasks/render.js
import {
  calculatePriority,
  calculateUrgency,
  calculateSlackMargin,
} from "../../priority.js";
import { toggleTaskComplete, deleteTask } from "../../services/firestore.js";

// Combine overlapping study intervals
function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const arr = intervals
    .map((i) => ({ start: new Date(i.start), end: new Date(i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = arr[i];
    if (cur.start <= prev.end) {
      if (cur.end > prev.end) prev.end = cur.end;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

// Count study minutes from now until end-of-day on due date,
// from BOTH persisted blocks (state.studyAll) AND base pattern expanded daily,
// minus any recorded per-week exclusions in state.baseExclusionsByWeek.
function studyMinutesUntil(dueDateStr, state, now) {
  const n = now();
  const due = new Date(`${dueDateStr}T23:59:59`);
  if (Number.isNaN(due.getTime()) || due <= n) return 0;

  const clipped = [];

  // 1) Persisted blocks (unchanged)
  for (const b of state.studyAll) {
    const start = b.start instanceof Date ? b.start : new Date(b.start);
    const end = b.end instanceof Date ? b.end : new Date(b.end);
    if (!(start < due && end > n)) continue;
    const segStart = new Date(Math.max(start.getTime(), n.getTime()));
    const segEnd = new Date(Math.min(end.getTime(), due.getTime()));
    if (segEnd > segStart) clipped.push({ start: segStart, end: segEnd });
  }

  // 2) Base pattern across days n..due, minus exclusions
  const dayMs = 24 * 60 * 60 * 1000;
  const startDay = new Date(n); startDay.setHours(0, 0, 0, 0);

  for (let t = startDay.getTime(); t <= due.getTime(); t += dayMs) {
    const d = new Date(t);
    const weekday = (d.getDay() + 6) % 7; // Mon=0..Sun=6

    // compute Monday of this date for week id
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - weekday);
    weekStart.setHours(0, 0, 0, 0);
    const weekId = (new Date(weekStart.getTime() - weekStart.getTimezoneOffset() * 60000))
      .toISOString().slice(0, 10); // YYYY-MM-DD (Mon UTC)

    const excl = state.baseExclusionsByWeek?.get(weekId);

    for (const p of state.baseStudyPattern || []) {
      if (p.weekday !== weekday) continue;
      const slotStart = new Date(d);
      slotStart.setHours(p.hour, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
      const slotKey = slotStart.getTime();

      if (excl?.has?.(slotKey)) continue;         // skip excluded
      if (!(slotStart < due && slotEnd > n)) continue;

      const segStart = new Date(Math.max(slotStart.getTime(), n.getTime()));
      const segEnd = new Date(Math.min(slotEnd.getTime(), due.getTime()));
      if (segEnd > segStart) clipped.push({ start: segStart, end: segEnd });
    }
  }

  // Merge overlaps (you already have mergeIntervals above)
  const merged = mergeIntervals(clipped);
  let minutes = 0;
  for (const seg of merged) minutes += (seg.end - seg.start) / 60000;
  return minutes;
}


function priorityForTask(task, state, now) {
  const studyMins = studyMinutesUntil(task.dueDate, state, now);
  const timeAvail = studyMins / 60;
  const margin = calculateSlackMargin(task.timeNeeded, timeAvail);
  const urgency = calculateUrgency(margin);
  const score = calculatePriority(urgency, task.importance ?? 3);
  return { timeAvail, margin, urgency, score };
}

export function renderTasks(state, now) {
  const list = document.getElementById("taskList");
  const emptyMsg = document.getElementById("noTasksMsg");
  if (!list) return;

  // build an array of tasks with computed priorities
  let tasks = state.tasks.map((t) => ({
    t,
    p: priorityForTask(t, state, now),
  }));

  // ✅ sort mode switch
  if (state.sortMode === "dueDate") {
    tasks.sort((a, b) => new Date(a.t.dueDate) - new Date(b.t.dueDate));
  } else if (state.sortMode === "alpha") {
    // Sort alphabetically by task name
    tasks.sort((a, b) => (a.t.name || "").localeCompare(b.t.name || ""));
  } else if (state.sortMode === "time") {
    // Sort by estimated time required (ascending)
    tasks.sort((a, b) => (a.t.timeNeeded ?? 0) - (b.t.timeNeeded ?? 0));
  } else {
    // Default: sort by priority score (descending)
    tasks.sort((a, b) => b.p.score - a.p.score);
  }

  // ✅ render
  list.innerHTML = "";
  if (emptyMsg) emptyMsg.classList.toggle("visible", tasks.length === 0);

  tasks.forEach(({ t, p }) => {
    const due = new Date(t.dueDate);
    const date = isNaN(due)
      ? "—"
      : due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const urgency = p.urgency;
    const color =
      urgency >= 5
        ? "border-danger"
        : urgency >= 3
          ? "border-warning"
          : "border-success";

    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card shadow-sm border-0 border-start border-4 ${color}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="card-title mb-0 ${t.completed ? "text-decoration-line-through" : ""
      }">${t.name}</h5>
            <span class="badge ${color.replace("border", "bg")} text-light">${t.importance ?? 3
      }/5</span>
          </div>
          <p class="mb-1"><strong>Due:</strong> ${date}</p>
          <p class="mb-1"><strong>Study hrs left:</strong> ${p.timeAvail.toFixed(
        1
      )}</p>
          <p class="mb-2"><strong>Slack ratio:</strong> ${p.margin.toFixed(
        2
      )}</p>
          <div class="d-flex justify-content-between">
            <button class="btn btn-sm ${t.completed ? "btn-secondary" : "btn-success"
      } toggle-complete">
              ${t.completed ? "Undo" : "Complete"}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
          </div>
        </div>
      </div>`;

    col
      .querySelector(".toggle-complete")
      ?.addEventListener("click", async () => {
        await toggleTaskComplete(t.id, !t.completed);
      });
    col.querySelector(".delete-task")?.addEventListener("click", async () => {
      await deleteTask(t.id);
    });

    list.appendChild(col);
  });
}
