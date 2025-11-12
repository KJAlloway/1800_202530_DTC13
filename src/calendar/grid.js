// calendar/grid.js
import { DAYS, HOURS, fmtHour } from './constants.js';
import { visibleWeekRange, addDays, weekTitleText } from './range.js';

export function buildCalendarGrid(weekOffset) {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarWeekTitle');
    if (!grid) return;

    const { start } = visibleWeekRange(weekOffset);
    const dayLabels = DAYS.map((d, i) => {
        const dt = addDays(start, i);
        const md = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<div class="day-header"><div>${d}</div><small class="text-muted">${md}</small></div>`;
    });

    grid.innerHTML = `<div class="corner-cell"></div>${dayLabels.join('')}`;

    HOURS.forEach(h => {
        grid.insertAdjacentHTML('beforeend', `<div class="hour-label">${fmtHour(h)}</div>`);
        DAYS.forEach(d => {
            const key = `${d}-${h}`;
            grid.insertAdjacentHTML('beforeend', `<div class="time-slot" data-key="${key}"></div>`);
        });
    });

    if (title) title.textContent = weekTitleText(weekOffset);
}

export function hydrateCalendarFromState(state) {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.querySelectorAll('.time-slot .study-label').forEach(n => n.remove());

    const { start: weekStart } = visibleWeekRange(state.weekOffset);

    for (let di = 0; di < DAYS.length; di++) {
        for (const h of HOURS) {
            const key = `${DAYS[di]}-${h}`;
            const el = grid.querySelector(`.time-slot[data-key="${key}"]`);
            if (!el) continue;

            const slotStart = new Date(weekStart);
            slotStart.setDate(weekStart.getDate() + di);
            slotStart.setHours(h, 0, 0, 0);

            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);


            const blk = state.studyBlocks.find(b => b.start < slotEnd && b.end > slotStart);
            const inStudy = Boolean(blk);
            const isBase = inStudy && blk._base === true;

            el.classList.toggle('study', inStudy);
            el.classList.toggle('study-base', isBase);

            if (inStudy) {
                const lab = document.createElement('span');
                lab.className = 'study-label';
                lab.innerHTML = 'Study<br>time';
                lab.title = isBase ? 'Base schedule' : 'Study time';
                el.appendChild(lab);
            }
        }
    }
}

export function refilterVisibleWeek(state, renderTasks) {
    const { start, end } = visibleWeekRange(state.weekOffset);
    state.events = state.eventsAll.filter(ev => ev.start < end && ev.end > start);

    // derive base-pattern blocks for this week
    const weekStart = visibleWeekRange(state.weekOffset).start;
    const derived = (state.baseStudyPattern || []).map(({ weekday, hour }) => {
        const s = new Date(weekStart);
        s.setDate(weekStart.getDate() + weekday);
        s.setHours(hour, 0, 0, 0);
        const e = new Date(s.getTime() + 60 * 60 * 1000);
        return { start: s, end: e, _base: true };
    })
        .filter(b => !state.baseExclusions?.has(b.start.getTime()))

        .filter(b => b.start < end && b.end > start);

    // merge persisted study blocks with derived base ones
    state.studyBlocks = [
        ...state.studyAll.filter(b => b.start < end && b.end > start),
        ...derived
    ];

    hydrateCalendarFromState(state);
    renderTasks();
}


// Render tasks
export function renderTasks(tasks = []) {
    const container = document.getElementById('task-list');
    if (!container) return;
    container.innerHTML = ''; // clear old tasks
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.textContent = task.title || 'Untitled task';
        container.appendChild(li);
    });
}
