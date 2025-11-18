// src/calendarHelpers.js
// Helper functions for working with calendar dates and times.
// These utilities provide:
// - Local week start (Monday at 00:00).
// - ISO-formatted UTC hour strings.
// - A stable week identifier based on Monday's date.
// - A helper to compute an ISO hour for a given day+hour cell.

/**
 * Compute the local Monday (00:00) of the week containing the given date.
 *
 * If no date is provided, the current date/time is used.
 *
 * @param {Date} [date=new Date()] - The base date (defaults to "now").
 * @returns {Date} A new Date object set to Monday at 00:00 (local time)
 *   for the week that contains the given date.
 */
export function startOfWeekLocal(date = new Date()) {
    // getDay() returns the day of week in local time:
    //   0 = Sunday, 1 = Monday, ..., 6 = Saturday.
    const dayOfWeek = date.getDay();

    // Compute how many days we need to move backwards from "date"
    // to reach Monday. The trick (day + 6) % 7 converts:
    //   - Monday (1) -> 0
    //   - Tuesday (2) -> 1
    //   ...
    //   - Sunday (0) -> 6
    const diffToMonday = (dayOfWeek + 6) % 7;

    // Clone the Date so we don't mutate the original.
    const monday = new Date(date);

    // Reset the time to midnight (00:00:00.000) in local time.
    monday.setHours(0, 0, 0, 0);

    // Move back diffToMonday days to arrive at Monday of this week.
    // setDate() handles month boundaries automatically.
    monday.setDate(date.getDate() - diffToMonday);

    return monday;
}

/**
 * Convert a local date/time to an ISO 8601 UTC string for the start of that hour.
 *
 * - Minutes, seconds, and milliseconds are set to zero (start of hour).
 * - The output is in UTC with a trailing "Z" (e.g., "2025-11-17T22:00:00Z").
 *
 * @param {Date|string|number} localDate - A value accepted by new Date().
 * @returns {string} ISO 8601 string "YYYY-MM-DDTHH:MM:SSZ" in UTC.
 */
export function toIsoHourUTC(localDate) {
    // Clone into a Date instance to avoid mutating the input.
    const dt = new Date(localDate);

    // Truncate to the start of the local hour by zeroing out minutes,
    // seconds, and milliseconds.
    dt.setMinutes(0, 0, 0);

    // getTime() gives milliseconds since the epoch for this LOCAL time.
    const localTimeMs = dt.getTime();

    // getTimezoneOffset() returns the difference, in minutes, between
    // local time and UTC (local = UTC + offsetMinutes).
    const offsetMinutes = dt.getTimezoneOffset();
    const offsetMs = offsetMinutes * 60000;

    // Subtract the offset to get the UTC timestamp for the same
    // wall-clock time.
    const utcTimeMs = localTimeMs - offsetMs;

    // Create a new Date at that UTC timestamp and convert to ISO.
    // Example: "2025-11-17T22:00:00.000Z"
    const isoWithMillis = new Date(utcTimeMs).toISOString();

    // Keep only "YYYY-MM-DDTHH:MM:SS" (19 characters) and then add "Z"
    // to indicate UTC. Result: "YYYY-MM-DDTHH:MM:SSZ".
    return isoWithMillis.slice(0, 19) + 'Z';
}

/**
 * Compute a stable week identifier string for the week containing the given date.
 *
 * The identifier is the UTC date of the Monday for that week in the
 * format "YYYY-MM-DD".
 *
 * @param {Date} date - The date whose week we want to identify.
 * @returns {string} A string like "2025-11-17" (Monday in UTC).
 */
export function isoWeekId(date) {
    // Find Monday (00:00 local) for the week containing "date".
    const mondayLocal = startOfWeekLocal(date);

    const localMs = mondayLocal.getTime();
    const offsetMinutes = mondayLocal.getTimezoneOffset();
    const offsetMs = offsetMinutes * 60000;

    // Convert the local Monday midnight to a UTC timestamp.
    const mondayUtcMs = localMs - offsetMs;

    // Convert to ISO and take only the date portion "YYYY-MM-DD".
    // This gives a stable week id anchored on Monday in UTC.
    return new Date(mondayUtcMs).toISOString().slice(0, 10);
}

/**
 * Build an ISO UTC hour string for a given day label and hour (24h),
 * relative to the current week.
 *
 * For example, if the current week’s Monday is 2025-11-17 and
 * we call buildIsoHourForCell('Wed', 15), this returns an ISO string
 * representing Wednesday at 15:00 (3 PM) local time, converted to UTC.
 *
 * @param {string} dayLabel - One of 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'.
 * @param {number} hour24  - Hour in 24-hour format (0..23).
 * @returns {string} ISO 8601 UTC string "YYYY-MM-DDTHH:MM:SSZ" for that cell.
 */
export function buildIsoHourForCell(dayLabel, hour24) {
    // Get Monday (00:00 local) for the current week.
    const mondayLocal = startOfWeekLocal();

    // Map day labels to their offset from Monday.
    // indexOf('Mon') -> 0, indexOf('Tue') -> 1, etc.
    const dayOffset = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
        dayLabel,
    );

    // Clone Monday so we do not mutate the original Date.
    const cellDate = new Date(mondayLocal);

    // Move forward dayOffset days from Monday to reach the correct weekday.
    cellDate.setDate(mondayLocal.getDate() + dayOffset);

    // Set the time for this cell to the requested hour (local time),
    // with minutes, seconds, and milliseconds set to zero.
    cellDate.setHours(hour24, 0, 0, 0);

    // Finally, convert that local date/time to an ISO UTC hour string.
    return toIsoHourUTC(cellDate);
}
