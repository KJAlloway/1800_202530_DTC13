// calendar/constants.js
// This module defines shared calendar-related constants and helpers
// that are reused across the calendar UI (day labels, hour slots,
// and a function to format hours for display).

// Export a constant array of day labels for the calendar header.
// The order is Monday through Sunday, and other parts of the app
// rely on this order to align days with the correct columns.
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Export a constant array of hour values for the calendar rows.
// We want integer hours from 7 (7 AM) up to 23 (11 PM), inclusive,
// expressed in 24-hour time. We generate this using Array.from:
//
// - { length: 17 } creates an "array-like" object with 17 slots.
// - Array.from turns that into an actual array, and also runs the
//   mapping function for each index from 0 to 16.
// - The mapping function (_, index) => 7 + index ignores the first
//   parameter (the existing value, which is undefined here) and uses
//   the index to compute the hour. This yields:
//   index 0  -> 7
//   index 1  -> 8
//   ...
//   index 16 -> 23
export const HOURS = Array.from({ length: 17 }, (_, index) => 7 + index); // [7..23]

// Export a helper function that formats a 24-hour hour value (0–23)
// into a 12-hour clock label with an "AM" or "PM" suffix.
// For example:
//   fmtHour(7)  -> "7 AM"
//   fmtHour(12) -> "12 PM"
//   fmtHour(13) -> "1 PM"
export const fmtHour = (hour) =>
    // Use a template literal to build the final string "<hour> <AM/PM>".
    `${(
        // Compute the 12-hour clock number.
        // - The modulo operation hour % 12 converts 24-hour values
        //   into a range from 0 to 11.
        // - On a clock, we never show "0". Both midnight and noon
        //   are displayed as "12", so if the modulo result is 0,
        //   we display 12 instead.
        hour % 12 === 0 ? 12 : hour % 12
    )} ${
    // Decide whether to show "AM" or "PM".
    // - Hours less than 12 are considered "AM".
    // - Hours 12 and above are considered "PM".
    hour < 12 ? 'AM' : 'PM'
    }`;
