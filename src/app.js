// app.js
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.scss";

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
};
const now = () => nowFn();

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
    try {
      await toggleStudyHour(dLabel, hour24);
    } catch (err) {
      console.error("[CAL] toggle hour failed:", err);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // initial grid (same order)
  attachCalendarClicks();
  buildCalendarGrid(state.weekOffset);
  hydrateCalendarFromState(state);

  // auth + tasks/events/study live wires
  attachAuthFlows(state, now);
});

export { state, now, refilterVisibleWeek }; // used by other modules if needed
