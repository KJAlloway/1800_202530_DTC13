// calendar/range.js
let clockOffsetMs = 0; // mirrors your state; kept local here

export function setClockOffset(ms) { clockOffsetMs = ms || 0; }
export function now() { return new Date(Date.now() + clockOffsetMs); }

export function startOfWeekLocal(d = now()) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addWeeks(d, n) { return addDays(d, n * 7); }

export function visibleWeekRange(weekOffset = 0) {
    const start = addWeeks(startOfWeekLocal(), weekOffset);
    const end = addDays(start, 7);
    return { start, end };
}

export function weekTitleText(weekOffset = 0) {
    const { start, end } = visibleWeekRange(weekOffset);
    const opt = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(undefined, opt)} – ${addDays(end, -1).toLocaleDateString(undefined, opt)}`;
}
