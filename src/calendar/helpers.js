// src/calendarHelpers.js
export function startOfWeekLocal(d = new Date()) {
    const day = d.getDay();            // 0..6 Sun..Sat
    const diffToMon = ((day + 6) % 7); // 0 if Monday
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(d.getDate() - diffToMon);
    return monday;
}
export function toIsoHourUTC(localDate) {
    const dt = new Date(localDate);
    dt.setMinutes(0, 0, 0);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + 'Z';
}
export function isoWeekId(d) {
    const m = startOfWeekLocal(d);
    return new Date(m.getTime() - m.getTimezoneOffset() * 60000).toISOString().slice(0, 10); // YYYY-MM-DD (Mon, UTC)
}
export function buildIsoHourForCell(dayLabel, hour24) {
    const monday = startOfWeekLocal();
    const dayOffset = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dayLabel);
    const cellDate = new Date(monday);
    cellDate.setDate(monday.getDate() + dayOffset);
    cellDate.setHours(hour24, 0, 0, 0);
    return toIsoHourUTC(cellDate);
}