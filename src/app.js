// app.js
// Entry point for the web app. Responsible for:
// - Loading global styles.
// - Defining the core application state object.
// - Wiring up the calendar grid, click behavior, and base schedule modal.
// - Initializing authentication / Firestore flows that hydrate state.

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
// Single "store" for the core entities used by the app.
// Most of these are hydrated and kept in sync by attachAuthFlows.
const state = {
  tasks: [],                // All tasks (populated via auth/FireStore).
  studyAll: [],             // All persisted study blocks across all weeks.
  studyBlocks: [],          // Visible-week blocks (merged persisted + base).
  availSlots: new Set(),    // (Reserved for availability features, if used.)
  clockOffsetMs: 0,         // Optional local record of any clock offset in use.
  weekOffset: 0,            // 0 = current week, 1 = next week, -1 = previous week.

  // Base schedule pattern and exclusions.
  baseStudyPattern: [],              // [{ weekday: 0..6, hour: 0..23 }]
  baseExclusions: new Set(),         // slotKeys excluded for the visible week.
  baseExclusionsByWeek: new Map(),   // Map<weekId, Set<slotKey>> (cache).
};

// A small wrapper around the offset-aware "now" function from range.js.
// We pass this around instead of Date.now() directly.
const now = () => nowFn();

// ---------- Helpers ----------

/**
 * For a given day label (e.g., "Mon") and 24-hour clock hour,
 * compute the Date start/end window for that slot in the current
 * visible week.
 *
 * @param {string} dayLabel - One of the entries in DAYS (e.g., "Mon").
 * @param {number} hour24   - Hour in 24-hour format (0..23).
 * @returns {{start: Date, end: Date}} The start and end of that 1-hour slot.
 */
function hourWindowForCell(dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange(state.weekOffset);
  const dayIndex = DAYS.indexOf(dayLabel);
  if (dayIndex < 0) {
    throw new Error(`Bad day label: ${dayLabel}`);
  }

  const slotStartMs = slotKeyFor(weekStart, dayIndex, hour24);
  const slotStart = new Date(slotStartMs);
  const slotEnd = new Date(slotStartMs + 60 * 60 * 1000); // + 1 hour
  return { start: slotStart, end: slotEnd };
}

/**
 * Classify a given slot based on the current state.
 *
 * Returns an object containing:
 * - kind: "persisted", "base", or null.
 * - slotKey: the millisecond timestamp key for this slot.
 *
 * Logic:
 * - If any persisted block overlaps, kind = "persisted".
 * - Else if the slot is in the base pattern AND not excluded, kind = "base".
 * - Else, kind = null.
 */
function kindForSlot(state, dayLabel, hour24) {
  const { start: weekStart } = visibleWeekRange(state.weekOffset);
  const dayIndex = DAYS.indexOf(dayLabel);
  if (dayIndex < 0) return null;

  const slotKey = slotKeyFor(weekStart, dayIndex, hour24);
  const slotStart = new Date(slotKey);
  const slotEnd = new Date(slotKey + 60 * 60 * 1000);

  // Persisted takes precedence over base.
  const hasPersisted = state.studyAll.some(
    (b) => b.start < slotEnd && b.end > slotStart,
  );
  if (hasPersisted) {
    return { kind: "persisted", slotKey };
  }

  // Otherwise, check whether the base pattern says there should be a block here.
  const inPattern = (state.baseStudyPattern || []).some(
    (p) => p.weekday === dayIndex && p.hour === hour24,
  );
  const isExcluded = state.baseExclusions?.has(slotKey);

  if (inPattern && !isExcluded) {
    return { kind: "base", slotKey };
  }

  return { kind: null, slotKey };
}

/**
 * Simplified toggle for a study hour slot:
 * - If a block already exists for this exact hour window, delete it.
 * - Otherwise, create a new persisted block.
 *
 * This helper is a minimal version of the more complex logic used in
 * the main calendar click handler, which also accounts for base pattern.
 */
async function toggleStudyHour(dayLabel, hour24) {
  const { start, end } = hourWindowForCell(dayLabel, hour24);

  const existing = state.studyBlocks.find(
    (b) =>
      b.start.getTime() === start.getTime() &&
      b.end.getTime() === end.getTime(),
  );

  if (existing?.id) {
    await deleteStudyBlock(existing.id);
    return;
  }

  console.log("[CLICK] creating new study block");
  await addStudyBlockForWindow(dayLabel, start, end);
}

// ---------- Calendar click wiring ----------

// Guard so we only attach the calendar click listener once.
let clicksAttached = false;

// Timestamp of the last base-pattern click, used to throttle double-writes.
let lastBaseClickMs = 0;

/**
 * Attach a single click handler to the calendar container.
 * Uses event delegation to interpret clicks on .time-slot cells and
 * dispatch the appropriate behavior based on:
 * - Base pattern membership,
 * - Weekly exclusions,
 * - Existing persisted blocks,
 * - Modifier keys (Ctrl/Cmd/Alt) to un-exclude.
 */
function attachCalendarClicks() {
  if (clicksAttached) return;
  clicksAttached = true;

  document.getElementById("calendar")?.addEventListener("click", async (event) => {
    // Use event delegation: locate the closest .time-slot ancestor.
    const cell = event.target.closest?.(".time-slot");
    if (!cell) return;

    const key = cell.dataset.key; // e.g., "Mon-7"
    if (!key) return;

    const [dayLabel, hourString] = key.split("-");
    const hour24 = parseInt(hourString, 10);
    if (Number.isNaN(hour24)) return;

    const { start: weekStart } = visibleWeekRange(state.weekOffset);
    const dayIndex = DAYS.indexOf(dayLabel);
    if (dayIndex < 0) return;

    const slotKey = slotKeyFor(weekStart, dayIndex, hour24);
    const slotStart = new Date(slotKey);
    const slotEnd = new Date(slotKey + 60 * 60 * 1000);

    // Compute the current classification of this slot from state.
    const inPattern = (state.baseStudyPattern || []).some(
      (p) => p.weekday === dayIndex && p.hour === hour24,
    );
    const isExcluded = state.baseExclusions?.has(slotKey) === true;
    const persisted = state.studyAll.find(
      (b) => b.start < slotEnd && b.end > slotStart,
    );
    const hasPersisted = !!persisted;

    try {
      // ----- Base pattern behavior -----
      if (inPattern) {
        // Throttle base clicks to avoid accidental double-writes.
        const nowMs = Date.now();
        if (nowMs - lastBaseClickMs < 120) return;
        lastBaseClickMs = nowMs;

        // Compute week id for this visible week (Monday "YYYY-MM-DD").
        const { start } = visibleWeekRange(state.weekOffset);
        const weekId = isoWeekId(start);

        // Holding Ctrl/Cmd/Alt means the user wants to un-exclude an excluded base.
        const wantUnexclude =
          event.ctrlKey || event.metaKey || event.altKey;

        if (hasPersisted) {
          // If a persisted block exists on a base slot, a click removes it,
          // revealing the base slot again once snapshots repaint.
          await deleteStudyBlock(persisted.id);
          return;
        }

        if (isExcluded) {
          if (wantUnexclude) {
            // Modifier + click on an excluded base slot => un-exclude it.
            await toggleBaseExclusion(weekId, slotKey, false);
            return;
          }
          // Normal click on an excluded base slot => create a one-off
          // persisted block for this hour.
          await addStudyBlockForWindow(dayLabel, slotStart, slotEnd);
          return;
        }

        // Base slot is visible and not excluded:
        // normal click excludes it for this week.
        await toggleBaseExclusion(weekId, slotKey, true);
        return;
      }

      // ----- Non-base pattern behavior (pure persisted toggle) -----
      const hasPersistedNonBase = state.studyBlocks.some(
        (b) =>
          !b._base &&
          b.start.getTime() === slotStart.getTime() &&
          b.end.getTime() === slotEnd.getTime(),
      );

      if (hasPersistedNonBase) {
        // Find and delete the existing persisted block.
        const existing = state.studyBlocks.find(
          (b) =>
            !b._base &&
            b.start.getTime() === slotStart.getTime() &&
            b.end.getTime() === slotEnd.getTime(),
        );
        if (existing?.id) {
          await deleteStudyBlock(existing.id);
        }
      } else {
        // Otherwise, create a new persisted block in this hour.
        await addStudyBlockForWindow(dayLabel, slotStart, slotEnd);
      }

      // No local/optimistic mutation here: Firestore snapshot listeners
      // (wired in attachAuthFlows) will update state and repaint.
    } catch (err) {
      console.error("[CAL] toggle hour failed:", err);
      console.error("[CAL] toggle hour failed:", err); // duplicated log, harmless.
    }
  });
}

// ---------- Boot ----------

/**
 * Main app bootstrap. Runs once the DOM is ready.
 * - Builds the calendar grid and initial paint.
 * - Initializes the base schedule modal.
 * - Attaches auth flows, which hydrate and keep state in sync.
 */
window.addEventListener("DOMContentLoaded", () => {
  // Set up click handling on the calendar.
  attachCalendarClicks();

  // Build the visible week grid and paint it from the initial state.
  buildCalendarGrid(state.weekOffset);
  hydrateCalendarFromState(state);

  // Initialize the Base Schedule modal; when the modal saves,
  // it will call renderTasks with the updated state and current time.
  initBaseScheduleModal(state, (s = state) => renderTasks(s, now()));

  // Wire authentication + Firestore streams, which:
  // - Hydrate tasks, study blocks, base pattern, and exclusions.
  // - Call refilterVisibleWeek and renderTasks as snapshots arrive.
  attachAuthFlows(state, now);
});

// Export state and a few core helpers for other modules to use.
export { state, now, refilterVisibleWeek };
