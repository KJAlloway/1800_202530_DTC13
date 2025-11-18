// app.js
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.scss";

import { attachAuthFlows } from "./auth/flows.js";
import { renderTasks } from "./features/tasks/render.js";
import {
  buildCalendarGrid,
  hydrateCalendarFromState,
  refilterVisibleWeek,
} from "./calendar/grid.js";
import { DAYS } from "./calendar/constants.js";
import {
  visibleWeekRange,
  now as nowFn,
  isoWeekId,
  slotKeyFor,
} from "./calendar/range.js";
import {
  addStudyBlockForWindow,
  deleteStudyBlock,
  toggleBaseExclusion,
} from "./services/firestore.js";
import { initBaseScheduleModal } from "./calendar/modal.js";

// ---------- Local app state ----------
const state = {
  tasks: [],                // hydrated by auth flows
  studyAll: [],             // persisted study blocks
  studyBlocks: [],          // visible-week merged blocks
  availSlots: new Set(),
  clockOffsetMs: 0,
  weekOffset: 0,
  // Base schedule
  baseStudyPattern: [],     // [{ weekday: 0..6, hour: 0..23 }]
  baseExclusions: new Set(),          // exclusions for visible week
  baseExclusionsByWeek: new Map(),    // optional cache
};

const now = () => nowFn();

// ---------- Helpers ----------
function hourWindowForCell(dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange(state.weekOffset);
  const dayIndex = DAYS.indexOf(dayLabel);
  if (dayIndex < 0) throw new Error(`Bad day label: ${dayLabel}`);

  const slotStartMs = slotKeyFor(weekStart, dayIndex, hour24);
  const slotStart = new Date(slotStartMs);
  const slotEnd = new Date(slotStartMs + 60 * 60 * 1000);
  return { start: slotStart, end: slotEnd };
}

// State-driven classifier: 'persisted' | 'base' | null
function kindForSlot(state, dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange(state.weekOffset);
  const dayIndex = DAYS.indexOf(dayLabel);
  if (dayIndex < 0) return null;

  const slotKey = slotKeyFor(weekStart, dayIndex, hour24);
  const slotStart = new Date(slotKey);
  const slotEnd = new Date(slotKey + 60 * 60 * 1000);

  // Persisted takes precedence
  const hasPersisted = state.studyAll.some(
    (b) => b.start < slotEnd && b.end > slotStart
  );
  if (hasPersisted) return { kind: "persisted", slotKey };

  const inPattern = (state.baseStudyPattern || []).some(
    (p) => p.weekday === dayIndex && p.hour === hour24
  );
  const isExcluded = state.baseExclusions?.has(slotKey);
  if (inPattern && !isExcluded) return { kind: "base", slotKey };

  return { kind: null, slotKey };
}

async function toggleStudyHour(dayLabel, hour24) {
  const { start, end } = hourWindowForCell(dayLabel, hour24);
  const existing = state.studyBlocks.find(
    (b) => b.start.getTime() === start.getTime() && b.end.getTime() === end.getTime()
  );
  if (existing?.id) {
    await deleteStudyBlock(existing.id);
    return;
  }
  console.log("[CLICK] creating new study block");
  await addStudyBlockForWindow(dayLabel, start, end);
}

// ---------- Calendar click wiring ----------
let clicksAttached = false;
let lastBaseClickMs = 0; // throttle to avoid accidental double-writes

function attachCalendarClicks() {
  if (clicksAttached) return;
  clicksAttached = true;

  document.getElementById("calendar")?.addEventListener("click", async (e) => {
    const cell = e.target.closest?.(".time-slot");
    if (!cell) return;
    const key = cell.dataset.key;
    if (!key) return;

    const [dayLabel, hStr] = key.split("-");
    const hour24 = parseInt(hStr, 10);
    if (Number.isNaN(hour24)) return;

    const { start: weekStart } = visibleWeekRange(state.weekOffset);
    const dayIndex = DAYS.indexOf(dayLabel);
    if (dayIndex < 0) return;

    const slotKey = slotKeyFor(weekStart, dayIndex, hour24);
    const slotStart = new Date(slotKey);
    const slotEnd = new Date(slotKey + 60 * 60 * 1000);

    // Read current state (no optimistic mutation)
    const inPattern = (state.baseStudyPattern || []).some(
      (p) => p.weekday === dayIndex && p.hour === hour24
    );
    const isExcluded = state.baseExclusions?.has(slotKey) === true;
    const persisted = state.studyAll.find((b) => b.start < slotEnd && b.end > slotStart);
    const hasPersisted = !!persisted;

    try {
      if (inPattern) {
        // Small throttle to prevent double-writes on base clicks
        const t = Date.now();
        if (t - lastBaseClickMs < 120) return;
        lastBaseClickMs = t;

        const { start } = visibleWeekRange(state.weekOffset);
        const weekId = isoWeekId(start);

        // Modifier = force UN-exclude (show base again)
        const wantUnexclude = e.ctrlKey || e.metaKey || e.altKey;

        if (hasPersisted) {
          // If a persisted block exists on a base slot, clicking removes it.
          await deleteStudyBlock(persisted.id);
          return; // snapshot will repaint
        }

        if (isExcluded) {
          if (wantUnexclude) {
            // Ctrl/Cmd/Alt-click on an excluded base slot => un-exclude (show base again)
            await toggleBaseExclusion(weekId, slotKey, false);
            return;
          }
          // Default on excluded base: create a persisted block here
          await addStudyBlockForWindow(dayLabel, slotStart, slotEnd);
          return;
        }

        // Base is visible: default click excludes it for this week
        await toggleBaseExclusion(weekId, slotKey, true);
        return;
      }

      // Not part of base pattern → normal persisted toggle
      if (state.studyBlocks.some(b => b.start.getTime() === slotStart.getTime() && b.end.getTime() === slotEnd.getTime() && !b._base)) {
        // remove persisted
        const existing = state.studyBlocks.find(b => !b._base && b.start.getTime() === slotStart.getTime() && b.end.getTime() === slotEnd.getTime());
        if (existing?.id) await deleteStudyBlock(existing.id);
      } else {
        // create persisted
        await addStudyBlockForWindow(dayLabel, slotStart, slotEnd);
      }
      // Firestore snapshots will repaint
    } catch (err) {
      console.error("[CAL] toggle hour failed:", err);
      console.error("[CAL] toggle hour failed:", err);
    }
  });
}


// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
  attachCalendarClicks();
  buildCalendarGrid(state.weekOffset);
  hydrateCalendarFromState(state);

  // Base Schedule modal init (Save persists the pattern)
  initBaseScheduleModal(state, (s = state) => renderTasks(s, now()));

  // Auth flows wire watchers for tasks/study/pattern/exclusions
  attachAuthFlows(state, now);
});

export { state, now, refilterVisibleWeek };
