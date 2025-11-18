// calendar/range.js
// Core date/time helpers for the calendar.
// These functions define how "now", weeks, and hour slots are computed
// across the app, including test-time clock offsetting.

// A module-level offset (in milliseconds) applied to the real system time.
// This is useful for testing: you can simulate that "now" is in a different
// week without changing the actual system clock.
let clockOffsetMs = 0;

/**
 * Set the global clock offset (in milliseconds).
 *
 * Passing a falsy value (0, null, undefined) resets the offset to 0.
 *
 * @param {number} ms - Milliseconds to offset from the real system time.
 */
export function setClockOffset(ms) {
    clockOffsetMs = ms || 0;
}

/**
 * Return a Date representing "now", adjusted by the current clock offset.
 *
 * @returns {Date} A new Date object for the current time plus clockOffsetMs.
 */
export function now() {
    return new Date(Date.now() + clockOffsetMs);
}

/**
 * Compute Monday at 00:00:00.000 (local time) for the week containing "d".
 *
 * If no argument is provided, "d" defaults to the current offset-aware now().
 *
 * @param {Date|number|string} [d=now()] - A date-like value (Date, timestamp, etc.).
 * @returns {Date} A new Date object representing the local Monday at midnight
 *   for that week.
 */
export function startOfWeekLocal(d = now()) {
    // Clone the input so we do not mutate the original Date.
    const x = new Date(d);

    // getDay() returns day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat.
    // We want Monday as index 0, so we shift and wrap:
    //   Sunday (0)   -> (0 + 6) % 7 = 6
    //   Monday (1)   -> (1 + 6) % 7 = 0
    //   Tuesday (2)  -> 1
    //   ...
    const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6

    // Reset time to midnight in local time.
    x.setHours(0, 0, 0, 0);

    // Move backwards "day" days to land on Monday.
    x.setDate(x.getDate() - day);

    return x;
}

/**
 * Return a new Date "n" days after (or before) the given date.
 *
 * @param {Date|number|string} d - Base date.
 * @param {number} n - Number of days to add (can be negative).
 * @returns {Date} New Date shifted by n days.
 */
export function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

/**
 * Return a new Date "n" weeks after (or before) the given date.
 *
 * This is just a convenience wrapper over addDays(d, n * 7).
 *
 * @param {Date|number|string} d - Base date.
 * @param {number} n - Number of weeks to add (can be negative).
 * @returns {Date} New Date shifted by n weeks.
 */
export function addWeeks(d, n) {
    return addDays(d, n * 7);
}

/**
 * Compute the start and end of the visible week in local time,
 * optionally shifted by a week offset.
 *
 * - weekOffset = 0: this week (based on offset-aware now()).
 * - weekOffset = 1: next week.
 * - weekOffset = -1: previous week.
 *
 * The returned interval is [start, end), where:
 * - start = Monday 00:00 local for the visible week.
 * - end   = Monday 00:00 local for the following week.
 *
 * @param {number} [weekOffset=0] - Number of weeks to shift from the current week.
 * @returns {{start: Date, end: Date}} Object containing the start and end Dates.
 */
export function visibleWeekRange(weekOffset = 0) {
    const start = addWeeks(startOfWeekLocal(), weekOffset);
    const end = addDays(start, 7);
    return { start, end };
}

/**
 * Build a human-readable "week title" string for the visible week,
 * such as "Nov 17 – Nov 23".
 *
 * Uses the browser's default locale and shows:
 * - Short month name.
 * - Numeric day.
 *
 * @param {number} [weekOffset=0] - Week offset passed to visibleWeekRange.
 * @returns {string} A title string for the week.
 */
export function weekTitleText(weekOffset = 0) {
    const { start, end } = visibleWeekRange(weekOffset);
    const opt = { month: 'short', day: 'numeric' };

    const startLabel = start.toLocaleDateString(undefined, opt);
    const lastDayOfWeek = addDays(end, -1);
    const endLabel = lastDayOfWeek.toLocaleDateString(undefined, opt);

    return `${startLabel} – ${endLabel}`;
}

/* ------------------------------------------------------------------ */
/* Unified helpers — use these everywhere for base schedule logic     */
/* ------------------------------------------------------------------ */

/**
 * Monday-based week identifier in local time.
 *
 * Given a date-like value, this function finds the Monday of that week
 * (using startOfWeekLocal) and returns its date in "YYYY-MM-DD" form.
 *
 * @param {Date|number|string} dateLike - A date-like value for which we want the week id.
 * @returns {string} A string "YYYY-MM-DD" representing the local Monday of that week.
 */
export function isoWeekId(dateLike) {
    const monday = startOfWeekLocal(dateLike);

    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0'); // months are 0-based
    const day = String(monday.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Compute a deterministic hour-slot key in local time.
 *
 * This is used as a unique identifier for a specific hour of a
 * specific weekday in a given week.
 *
 * - weekStart must be Monday 00:00 local for the visible week
 *   (typically visibleWeekRange(...).start).
 * - weekday is an integer 0..6, where 0 = Monday and 6 = Sunday.
 * - hour is an integer 0..23 in 24-hour time.
 *
 * The returned value is the millisecond timestamp (Number) for the
 * start of that slot in local time. This is used:
 * - To generate unique ids like "base-<slotKey>".
 * - As keys in Sets (e.g., baseExclusions).
 * - To reconstruct Date objects when painting the calendar.
 *
 * @param {Date} weekStart - Monday 00:00 local for the relevant week.
 * @param {number} weekday - 0..6 (0 = Monday, 6 = Sunday).
 * @param {number} hour - 0..23 (24-hour clock).
 * @returns {number} Milliseconds since epoch for that slot's start time.
 */
export function slotKeyFor(weekStart, weekday, hour) {
    // Clone weekStart to avoid mutating the caller's Date.
    const slotStart = new Date(weekStart);

    // Move forward "weekday" days from Monday to get the right weekday.
    slotStart.setDate(weekStart.getDate() + weekday);

    // Set the local time to the requested hour, with minutes/seconds/ms zeroed.
    slotStart.setHours(hour, 0, 0, 0);

    // Return the underlying timestamp as our slot key.
    return slotStart.getTime();
}
