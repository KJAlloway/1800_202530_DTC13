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
import { DAYS, HOURS, fmtHour } from './calendar/constants.js';
import { visibleWeekRange, addDays, weekTitleText } from './calendar/range.js';
import { buildCalendarGrid, hydrateCalendarFromState, refilterVisibleWeek } from './calendar/grid.js';
import { Modal } from 'bootstrap';

// Build a calendar grid into a specific container (modal), using your same layout
function buildGridInto(gridEl, titleEl, weekOffset) {
    if (!gridEl) return;
    const { start } = visibleWeekRange(weekOffset);
    const dayLabels = DAYS.map((d, i) => {
        const dt = addDays(start, i);
        const md = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<div class="day-header"><div>${d}</div><small class="text-muted">${md}</small></div>`;
    });
    gridEl.innerHTML = `<div class="corner-cell"></div>${dayLabels.join('')}`;

    HOURS.forEach(h => {
        gridEl.insertAdjacentHTML('beforeend', `<div class="hour-label">${fmtHour(h)}</div>`);
        DAYS.forEach(d => {
            const key = `${d}-${h}`;
            gridEl.insertAdjacentHTML('beforeend', `<div class="time-slot" data-key="${key}"></div>`);
        });
    });
    if (titleEl) titleEl.textContent = weekTitleText(0);
}

// Paint “study” on the modal grid using the base pattern
function hydrateBaseGridFromPattern(pattern, gridEl) {
    if (!gridEl) return;
    // clear previous labels/styles
    gridEl.querySelectorAll('.time-slot').forEach(el => {
        el.classList.remove('study');
        el.querySelector('.study-label')?.remove();
    });

    for (const { weekday, hour } of pattern || []) {
        const key = `${DAYS[weekday]}-${hour}`;
        const el = gridEl.querySelector(`.time-slot[data-key="${key}"]`);
        if (!el) continue;
        el.classList.add('study');
        const lab = document.createElement('span');
        lab.className = 'study-label';
        lab.innerHTML = 'Study<br>time';
        lab.title = 'Study time';
        el.appendChild(lab);
    }
}
