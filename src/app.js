// app.js
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.scss";
import { renderTasks } from "./features/tasks/render.js";

import { attachAuthFlows } from "./auth/flows.js";
import {
  buildCalendarGrid,
  hydrateCalendarFromState,
  refilterVisibleWeek,
} from "./calendar/grid.js";
import { DAYS } from "./calendar/constants.js";
import { visibleWeekRange, now as nowFn } from "./calendar/range.js";
import {
  addStudyBlockForWindow,
  deleteStudyBlock,
} from "./services/firestore.js";
import { loadTasksFromLocal } from "./services/localStorages.js";
import { initBaseScheduleModal } from "./calendar/modal.js";

// Local app state (same shape as before)
const state = {
  tasks: loadTasksFromLocal(), // <-- For localStorage
  eventsAll: [],
  studyAll: [],
  studyBlocks: [],
  events: [],
  availSlots: new Set(),
  clockOffsetMs: 0,
  weekOffset: 0,
  baseStudyPattern: [], // [{ weekday: 0..6 (Mon..Sun), hour: 0..23 }]
  baseExclusions: new Set(),
};
const now = () => nowFn();

window.addEventListener("DOMContentLoaded", () => {
  attachCalendarClicks();
  buildCalendarGrid(state.weekOffset);
  hydrateCalendarFromState(state);

  // initialize the Base Schedule modal module
  initBaseScheduleModal(state, (s = state) => renderTasks(s, now()));

  attachAuthFlows(state, now);
});

// Hour math from your main file
function hourWindowForCell(dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange(state.weekOffset);
  const dayIndex = DAYS.indexOf(dayLabel); // 0..6 (Mon..Sun)
  if (dayIndex < 0) throw new Error(`Bad day label: ${dayLabel}`);

  const slotStart = new Date(weekStart);
  slotStart.setDate(weekStart.getDate() + dayIndex);
  slotStart.setHours(hour24, 0, 0, 0);

  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  return { start: slotStart, end: slotEnd };
}

async function toggleStudyHour(dayLabel, hour24) {
  const { start, end } = hourWindowForCell(dayLabel, hour24);
  const existing = state.studyBlocks.find(
    (b) =>
      b.start.getTime() === start.getTime() && b.end.getTime() === end.getTime()
  );
  if (existing) {
    await deleteStudyBlock(existing.id);
    return;
  }
  await addStudyBlockForWindow(dayLabel, start, end);
}

// Calendar click
function attachCalendarClicks() {
  document.getElementById("calendar")?.addEventListener("click", async (e) => {
    const cell = e.target.closest?.(".time-slot");
    if (!cell) return;
    const key = cell.dataset.key;
    if (!key) return;

    const [dLabel, hStr] = key.split("-");
    const hour24 = parseInt(hStr, 10);
    if (Number.isNaN(hour24)) return;

    // Compute this cell’s time window
    const { start: weekStart } = visibleWeekRange(state.weekOffset);
    const dayIndex = DAYS.indexOf(dLabel);
    if (dayIndex < 0) return;
    const slotStart = new Date(weekStart);
    slotStart.setDate(weekStart.getDate() + dayIndex);
    slotStart.setHours(hour24, 0, 0, 0);
    const slotKey = slotStart.getTime();

    // Is this a base-schedule slot?
    const isBase = cell.classList.contains("study-base");

    try {
      if (isBase) {
        // Toggle exclusion for this week
        state.baseExclusions ||= new Set();
        if (state.baseExclusions.has(slotKey))
          state.baseExclusions.delete(slotKey);
        else state.baseExclusions.add(slotKey);
        refilterVisibleWeek(state, () => {}); // repaint
      } else {
        // Regular behavior: toggle a persisted study block
        await toggleStudyHour(dLabel, hour24);
      }
    } catch (err) {
      console.error("[CAL] toggle hour failed:", err);
    }
  });
}

function updateDashboardProgress() {
  const tasks = JSON.parse(localStorage.getItem("tasks")) || [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;

  document.getElementById("tasksTotal").textContent = total;
  document.getElementById("tasksCompleted").textContent = completed;

  const progress = total > 0 ? (completed / total) * 100 : 0;
  document.getElementById("taskProgressBar").style.width = progress + "%";
}

updateDashboardProgress();

window.addEventListener("DOMContentLoaded", () => {
  // initial grid (same order)
  attachCalendarClicks();
  buildCalendarGrid(state.weekOffset);
  hydrateCalendarFromState(state);

  // auth + tasks/events/study live wires
  attachAuthFlows(state, now);
});

// --- Dashboard Sort Buttons ---
document.getElementById("sortDueDate")?.addEventListener("click", () => {
  state.sortMode = "dueDate";
  renderTasks(state, now);
});

document.getElementById("sortAlphabetic")?.addEventListener("click", () => {
  state.sortMode = "alpha";
  renderTasks(state, now);
});

document.getElementById("sortTimeRequired")?.addEventListener("click", () => {
  state.sortMode = "time";
  renderTasks(state, now);
});

// --- Update dashboard on load ---
updateDashboardProgress();

export { state, now, refilterVisibleWeek };
