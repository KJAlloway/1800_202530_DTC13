// calendar/grid.js
// This module is responsible for:
// 1. Building the static calendar grid structure (headers + cells).
// 2. Painting study blocks into that grid based on application state.
// 3. Recomputing which blocks should be visible for the current week.

import { DAYS, HOURS, fmtHour } from './constants.js';
import { visibleWeekRange, addDays, weekTitleText, slotKeyFor } from './range.js';

/* ---------------------- Build static grid shell ---------------------- */
/**
 * Build the visual calendar grid for a given week offset.
 *
 * This function:
 * - Locates the calendar grid and week title elements in the DOM.
 * - Computes the visible week based on the provided weekOffset.
 * - Adds a header row (corner + day labels + dates).
 * - Adds a row for each hour, with one "hour-label" cell and
 *   one "time-slot" cell for each day.
 *
 * It does NOT apply "study" styling or labels; that is handled
 * by hydrateCalendarFromState(state).
 *
 * @param {number} weekOffset - How many weeks to shift from the
 *   "current" week (0 = current week, 1 = next week, etc.).
 */
export function buildCalendarGrid(weekOffset) {
    // Get references to the grid container and the week title element.
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarWeekTitle');

    // If there is no grid element in the DOM, there is nothing to build.
    if (!grid) return;

    // Determine the start date of the visible week, based on the week offset.
    // visibleWeekRange returns an object like { start, end }.
    const { start } = visibleWeekRange(weekOffset);

    // Build an array of HTML strings for the day headers.
    // For each day label (e.g., "Mon"), we:
    // - Compute the actual date by adding the index to the week start.
    // - Format that date as a short month + numeric day (e.g., "Nov 17").
    // - Return a div with the day label and the formatted date.
    const dayHeaderHtmlList = DAYS.map((dayLabel, dayIndex) => {
        const dateForDay = addDays(start, dayIndex);
        const monthDayLabel = dateForDay.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        });

        return (
            `<div class="day-header">` +
            `<div>${dayLabel}</div>` +
            `<small class="text-muted">${monthDayLabel}</small>` +
            `</div>`
        );
    });

    // Set the initial contents of the grid:
    // - First, a "corner" cell in the top-left (where row/column labels meet).
    // - Then, one header cell per day, all concatenated together.
    grid.innerHTML =
        `<div class="corner-cell"></div>` +
        dayHeaderHtmlList.join('');

    // For each hour in our configured HOURS list (7..23),
    // we add a new row consisting of:
    // - One "hour-label" cell on the left.
    // - One "time-slot" cell for each day, each with a unique data-key.
    HOURS.forEach((hour) => {
        // Append the hour label cell (e.g., "7 AM", "8 AM").
        grid.insertAdjacentHTML(
            'beforeend',
            `<div class="hour-label">${fmtHour(hour)}</div>`,
        );

        // For each day, append a time-slot cell corresponding to this
        // day/hour combination. We encode the logical identity for this
        // cell in data-key so we can look it up later.
        DAYS.forEach((dayLabel) => {
            const key = `${dayLabel}-${hour}`;
            grid.insertAdjacentHTML(
                'beforeend',
                `<div class="time-slot" data-key="${key}"></div>`,
            );
        });
    });

    // If we have a title element, update its text to reflect the
    // current week (e.g., "Nov 17–23, 2025").
    if (title) {
        title.textContent = weekTitleText(weekOffset);
    }
}

/* ---------------------- Paint from state ---------------------- */
/**
 * Paint the calendar grid based on the current state.
 *
 * This function:
 * - Clears any existing "study" styles and labels from all time slots.
 * - For each day/hour slot, computes its time range.
 * - Finds any study block that overlaps that time.
 * - Styles the slot as "study" (and "study-base" for base schedule blocks).
 * - Inserts a "Study time" label and attaches data attributes
 *   to describe the type of block and its id.
 *
 * @param {object} state - The application state containing:
 *   - weekOffset: current week offset
 *   - studyBlocks: array of block objects with start/end Dates,
 *                  optional "id", and optional "_base" flag.
 */
export function hydrateCalendarFromState(state) {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const noBaseScheduleMsg = document.getElementById('noBaseScheduleMsg');
    if (noBaseScheduleMsg) {
        const hasBaseSchedule = (state.baseStudyPattern?.length ?? 0) > 0;
        noBaseScheduleMsg.style.display = hasBaseSchedule ? 'none' : 'block';
    }

    // First, clear any previous styling, labels, or metadata from
    // all time-slot elements so we can repaint from scratch.
    grid.querySelectorAll('.time-slot').forEach((slotElement) => {
        // Remove the "study" and "study-base" classes so the cell
        // returns to its plain appearance.
        slotElement.classList.remove('study', 'study-base');

        // Remove any existing label span inside the cell, if present.
        // We use optional chaining (?.) so that if the querySelector
        // returns null, .remove() is not called.
        slotElement.querySelector('.study-label')?.remove();

        // Remove any data attributes describing block type/id
        // that we might have attached earlier.
        delete slotElement.dataset.kind;
        delete slotElement.dataset.blockId;
    });

    // Determine the start of the currently visible week.
    const { start: weekStart } = visibleWeekRange(state.weekOffset);

    // For each day index (0..DAYS.length-1) and each hour, find out
    // whether any study block overlaps that slot and, if so, mark it.
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
        for (const hour of HOURS) {
            const key = `${DAYS[dayIndex]}-${hour}`;

            // Find the specific time-slot element corresponding to this
            // day/hour cell using the same data-key pattern used when
            // building the grid.
            const slotElement = grid.querySelector(
                `.time-slot[data-key="${key}"]`,
            );
            if (!slotElement) continue;

            // Compute the numeric timestamp for the start of this slot
            // using the helper from range.js.
            const slotStartMs = slotKeyFor(weekStart, dayIndex, hour);

            // Create Date objects for the slot's start and end.
            const slotStart = new Date(slotStartMs);
            const slotEnd = new Date(slotStartMs + 60 * 60 * 1000); // + 1 hour

            // Find the first study block whose time interval overlaps
            // this slot's interval. The overlap condition is:
            //   block.start < slotEnd AND block.end > slotStart
            // which means there is at least some non-zero intersection.
            const block =
                (state.studyBlocks || []).find(
                    (b) => b.start < slotEnd && b.end > slotStart,
                );

            // If no block overlaps this time slot, we leave the cell blank.
            if (!block) continue;

            // Determine whether this block is part of the base study schedule
            // or a persisted (user-created) block.
            const isBase = block._base === true;

            // Mark the cell as a study slot.
            slotElement.classList.add('study');

            // If it is part of the base schedule, add an extra class
            // for different styling (e.g., different color).
            if (isBase) {
                slotElement.classList.add('study-base');
            }

            // Create a label element to show within the slot.
            const label = document.createElement('span');
            label.className = 'study-label';

            // Use innerHTML instead of textContent so the <br> is interpreted
            // as a line break between "Study" and "time".
            label.innerHTML = 'Study<br>time';

            // Provide a tooltip describing whether this is part of the base
            // schedule or just a normal study block.
            label.title = isBase ? 'Base schedule' : 'Study time';

            // Append the label into the slot cell.
            slotElement.appendChild(label);

            // Attach metadata about what kind of block this is.
            slotElement.dataset.kind = isBase ? 'base' : 'persisted';

            // For persisted blocks, store the block's id (if it exists) so
            // that click handlers can identify which block is being clicked.
            if (!isBase && block.id) {
                slotElement.dataset.blockId = block.id;
            }
        }
    }
}

/* ---------------------- Recompute visible-week blocks ---------------------- */
/**
 * Recompute which study blocks are visible for the current week
 * and repaint the calendar grid accordingly.
 *
 * This function:
 * - Uses state.weekOffset to get the visible week range.
 * - Selects those persisted blocks that overlap the visible week.
 * - Generates base-schedule blocks for this week, applying user
 *   exclusions from state.baseExclusions.
 * - Merges persisted and base blocks, with persisted taking
 *   priority over base where they overlap.
 * - Sorts the merged list by time and block type.
 * - Stores the result in state.studyBlocks.
 * - Calls hydrateCalendarFromState(state) to repaint.
 * - Optionally calls the "after" callback for additional updates.
 *
 * @param {object} state - Main application state.
 * @param {function} [after] - Optional callback invoked after repaint.
 */
export function refilterVisibleWeek(state, after = () => { }) {
    // Determine the start and end of the visible week.
    const { start: weekStart, end: weekEnd } = visibleWeekRange(
        state.weekOffset,
    );

    // 1) Persisted study blocks that intersect the visible week.
    // We start from state.studyAll (all persisted blocks) and filter
    // to only those that overlap [weekStart, weekEnd).
    const persisted = (state.studyAll || []).filter(
        (b) => b.start < weekEnd && b.end > weekStart,
    );

    // 2) Base-derived blocks for this week.
    // We compute blocks from the baseStudyPattern and then apply
    // exclusions stored in state.baseExclusions.
    const exclusions =
        state.baseExclusions instanceof Set
            ? state.baseExclusions
            : new Set();

    const base = [];

    // baseStudyPattern is expected to be an array of objects like:
    // { weekday: 0..6, hour: 7..23 }.
    for (const patternEntry of state.baseStudyPattern || []) {
        // Safely destructure weekday and hour from each entry.
        const { weekday, hour } = patternEntry || {};

        // Skip if weekday or hour are missing (null or undefined).
        if (weekday == null || hour == null) continue;

        // Compute a unique slotKey for this week/day/hour.
        // This is typically a millisecond timestamp representing
        // the start of that hour in this particular week.
        const slotKey = slotKeyFor(weekStart, weekday, hour);

        // If the user has explicitly excluded this slot from the base
        // schedule (e.g., via the base schedule modal), skip it.
        if (exclusions.has(slotKey)) continue;

        // Create Date objects for the slot's start and end (1 hour long).
        const startDate = new Date(slotKey);
        const endDate = new Date(slotKey + 60 * 60 * 1000);

        // If this block does not intersect the visible week at all,
        // skip it. This is a safety check in case the base pattern
        // includes slots outside the visible range.
        if (endDate <= weekStart || startDate >= weekEnd) continue;

        // Add the base block to our list. We mark it with _base: true
        // so that downstream code can treat it as a base schedule item.
        base.push({
            id: `base-${slotKey}`,
            title: 'Study',
            start: startDate,
            end: endDate,
            _base: true,
        });
    }

    // 3) Persisted blocks take priority over base blocks when they overlap.
    // We keep all persisted blocks and only include base blocks that do not
    // overlap any persisted block.
    const merged = [
        ...persisted,
        ...base.filter(
            (baseBlock) =>
                !persisted.some(
                    (persistedBlock) =>
                        persistedBlock.start < baseBlock.end &&
                        persistedBlock.end > baseBlock.start,
                ),
        ),
    ];

    // 4) Sort the merged blocks:
    // - Primary key: start time (ascending).
    // - Secondary key: persisted before base when times are equal.
    merged.sort((a, b) => {
        // Compare by start time first.
        const timeDiff = a.start - b.start;
        if (timeDiff !== 0) return timeDiff;

        // If start times are equal, compare by _base flag.
        // Treat "persisted" (no _base) as smaller than "base" (true)
        // so persisted blocks come first.
        return (a._base === true) - (b._base === true);
    });

    // 5) Save the visible blocks into state, repaint the grid,
    //    and run the optional callback.
    state.studyBlocks = merged;
    hydrateCalendarFromState(state);
    after();
}
let calendarSyncTimeoutId = null;

export function showCalendarSynced() {
    const el = document.getElementById("calendarSync");
    if (!el) return;

    el.classList.remove("opacity-50");

    if (calendarSyncTimeoutId !== null) {
        clearTimeout(calendarSyncTimeoutId);
    }

    calendarSyncTimeoutId = setTimeout(() => {
        el.classList.add("opacity-50");
    }, 1500);
}
