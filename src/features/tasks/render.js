// features/tasks/render.js

// Importing the priority calculation helpers.
// These functions are responsible for turning time available and importance into a priority score.
import {
  calculatePriority,
  calculateUrgency,
  calculateSlackMargin,
} from "../../priority.js";

// Import Firestore actions for toggling completion and deleting tasks
import { toggleTaskComplete, deleteTask } from "../../services/firestore.js";

//  mergeIntervals(intervals)
//  -------------------------
//  Utility function that:
//  - Takes an array of time intervals { start, end }
//  - Combines overlapping or touching intervals into a single continuous block
// [ [1–3], [2–4] ] → [ [1–4] ]

function mergeIntervals(intervals) {
  if (!intervals.length) return [];

  // Convert each interval's start/end into Date objects in case they are strings,
  // filter out any invalid intervals where end <= start,
  // and sort them by start time (earliest first).
  const arr = intervals
    .map((i) => ({ start: new Date(i.start), end: new Date(i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  // Start with the first interval as our initial merged block
  const merged = [arr[0]];

  // Walk through all subsequent intervals and merge if overlapping
  for (let i = 1; i < arr.length; i++) {
    const prev = merged[merged.length - 1]; // This is the last merged interval
    const cur = arr[i]; // current interval we’re inspecting

    // If the current interval starts before or exactly when the previous one ends,
    // they overlap (or touch) and should be merged.
    if (cur.start <= prev.end) {
      // Extend the previous interval's end if the current one goes later
      if (cur.end > prev.end) prev.end = cur.end;
    } else {
      // Otherwise there is a gap then it will push the current interval as a new block
      merged.push(cur);
    }
  }
  return merged;
}

// studyMinutesUntil(dueDateStr, state, now)
// ----------------------------------------
// Calculates how many minutes of scheduled study time you have
// between "now" and the end of the given due date, based on ALL
// study blocks stored in state.studyAll.
// What everything means is below:
// dueDateStr: task.dueDate, e.g., "2025-11-20"
// state: global state object that contains state.studyAll
// now: function that returns the current Date when called (so it’s testable)

function studyMinutesUntil(dueDateStr, state, now) {
  // Current time (e.g., new Date())
  const n = now();
  // Compute the "end of the due date" as 23:59:59 local time
  const due = new Date(`${dueDateStr}T23:59:59`);
  // If due date is invalid or already passed, you have 0 minutes left
  if (Number.isNaN(due.getTime()) || due <= n) return 0;

  // clipped will hold the portion of each study block that lies between now and the due date.
  const clipped = [];
  // Loop through every available study block in the schedule
  for (const b of state.studyAll) {
    // Ensuring that the start and end are Date objects
    const start = b.start instanceof Date ? b.start : new Date(b.start);
    const end = b.end instanceof Date ? b.end : new Date(b.end);

    // Only consider blocks that intersect the [now, due] window.
    // Condition: block starts before the due time AND ends after the current time.
    if (!(start < due && end > n)) continue;

    // Clip the block so it starts no earlier than "now"
    const segStart = new Date(Math.max(start.getTime(), n.getTime()));

    // Then the ones that end no later than "due"
    const segEnd = new Date(Math.min(end.getTime(), due.getTime()));

    // If there is still a valid positive-length segment, add it to the list
    if (segEnd > segStart) clipped.push({ start: segStart, end: segEnd });
  }

  // 2) Base pattern across days due, minus exclusions
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
  // Merge any overlapping segments to avoid double-counting time
  const merged = mergeIntervals(clipped);

  // Sum up total minutes across all merged segments
  let minutes = 0;
  for (const seg of merged)

    // Difference of Dates gives milliseconds → divide by 1000 * 60 to get minutes
    minutes += (seg.end - seg.start) / 60000;
  return minutes;
}

// priorityForTask(task, state, now)
// ---------------------------------
// The function for computing priority-related metrics for a single task:
// timeAvail: how many hours of scheduled study are available before the due date
// margin: slack ratio (e.g., timeAvail/timeNeeded or whatever calculateSlackMargin does)
// urgency: how urgent the task is (based on margin)
// score: final priority score combining urgency + importance

function priorityForTask(task, state, now) {
  // Total study minutes between now and this task's due date
  const studyMins = studyMinutesUntil(task.dueDate, state, now);

  // Convert minutes to hours so it matches "timeNeeded" units
  const timeAvail = studyMins / 60;

  // Slack ratio: bigger margin = more time than needed; smaller = you're in trouble
  const margin = calculateSlackMargin(task.timeNeeded, timeAvail);

  // Convert slack margin into an urgency measure
  const urgency = calculateUrgency(margin);

  // Combine urgency with importance (1–5) to get a final priority score
  const score = calculatePriority(urgency, task.importance ?? 3);

  // Return all the computed values so we can display them and sort by them
  return { timeAvail, margin, urgency, score };
}

// renderTasks(state, now)
// -----------------------
// Renders all tasks into the DOM:
// Computes priority info for each task
// Sorts them depending on the chosen sort mode
// Builds Bootstrap cards with buttons for complete/undo and delete

export function renderTasks(state, now) {
  // The container where all task cards will be appended
  const list = document.getElementById("taskList");

  // An element that shows something something whenever the list is empty
  const emptyMsg = document.getElementById("noTasksMsg");

  // If there is no list element, then it will abort
  if (!list) return;

  // Build an array of objects: { t: task, p: priorityInfo }
  // This way we keep task data and its computed priority together
  let tasks = state.tasks.map((t) => ({
    t,
    p: priorityForTask(t, state, now),
  }));

  // ✅ sort mode switch
  // Depending on state.sortMode, we choose a different sorting strategy.
  if (state.sortMode === "dueDate") {
    // Sort by due date (earliest first)
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

  // A way to clear the existing list before re-rendering
  list.innerHTML = "";

  // Show or hide the "no tasks" message depending on whether there are tasks
  if (emptyMsg) emptyMsg.classList.toggle("visible", tasks.length === 0);

  // For each task + its computed priority info, build a card
  tasks.forEach(({ t, p }) => {
    // Convert due date string to Date
    const due = new Date(t.dueDate);

    // Format the date as something like "Nov 17".
    // If date is invalid, show a dash instead.
    const date = isNaN(due)
      ? "—"
      : due.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    // Extracting urgency from the computed priority info
    const urgency = p.urgency;

    // Choosing a Bootstrap border color based on urgency level:
    //  - >= 5 : red (danger)
    //  - >= 3 : yellow (warning)
    //  - < 3 : green (success)
    const color =
      urgency >= 5
        ? "border-danger"
        : urgency >= 3
          ? "border-warning"
          : "border-success";

    // Create a Bootstrap column wrapper for the card
    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-lg-4";

    // Build the inner HTML for the card
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
          <p class="mb-2"><strong>Time required:</strong> ${t.timeNeeded?.toFixed(1) ?? "—"} hrs</p>
          <div class="d-flex justify-content-between">
            <button class="btn btn-sm ${t.completed ? "btn-secondary" : "btn-success"
      } toggle-complete">
              ${t.completed ? "Undo" : "Complete"}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
          </div>
        </div>
      </div>`;

    // Preparing the "Complete / Undo" button:
    // clicking it flips the completed flag in Firestore.
    col
      .querySelector(".toggle-complete")
      ?.addEventListener("click", async () => {
        await toggleTaskComplete(t.id, !t.completed);
        // The Firestore listener elsewhere will detect the change and trigger re-render.
      });

    //  Preparing the "Delete" button:
    // clicking it removes the task from Firestore.
    col.querySelector(".delete-task")?.addEventListener("click", async () => {
      // Firestore listener handles updating the UI.
      await deleteTask(t.id);
    });

    // Finally, append this card to the task list container
    list.appendChild(col);
  });
}