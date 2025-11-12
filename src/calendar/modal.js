// calendar/modal.js
import { Modal } from 'bootstrap';
import { DAYS, HOURS, fmtHour } from './constants.js';
import { visibleWeekRange, addDays, weekTitleText } from './range.js';
import { refilterVisibleWeek } from './grid.js';

/** Build a calendar-like grid into a specific container */
function buildGridInto(gridEl, titleEl) {
    if (!gridEl) return;
    const { start } = visibleWeekRange(0);
    const dayLabels = DAYS.map((d, i) => {
        return `<div class="day-header"><div>${d}</div></div>`;
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

/** Paint “study” cells from the base pattern (weekday/hour pairs) */
function hydrateBaseGridFromPattern(pattern, gridEl) {
    if (!gridEl) return;
    gridEl.querySelectorAll('.time-slot').forEach(el => {
        el.classList.remove('study', 'study-base');   // clear BOTH classes
        el.querySelector('.study-label')?.remove();
    });
    for (const { weekday, hour } of pattern || []) {
        const key = `${DAYS[weekday]}-${hour}`;
        const el = gridEl.querySelector(`.time-slot[data-key="${key}"]`);
        if (!el) continue;
        + el.classList.add('study', 'study-base');
        const lab = document.createElement('span');
        lab.className = 'study-label';
        lab.innerHTML = 'Study<br>time';
        lab.title = 'Study time';
        el.appendChild(lab);
    }
}

function togglePatternCell(state, dLabel, hour) {
    const weekday = DAYS.indexOf(dLabel);
    if (weekday < 0) return;
    state.baseStudyPattern ||= [];
    const idx = state.baseStudyPattern.findIndex(p => p.weekday === weekday && p.hour === hour);
    if (idx >= 0) state.baseStudyPattern.splice(idx, 1);
    else state.baseStudyPattern.push({ weekday, hour });
}

/** Public: attach modal behaviors */
export function initBaseScheduleModal(state, renderTasks) {
    const openBtn = document.getElementById('openBaseSchedule');
    const modalEl = document.getElementById('baseScheduleModal');
    const gridEl = document.getElementById('baseScheduleGrid');
    const titleEl = document.getElementById('baseScheduleTitle');
    const clearBtn = document.getElementById('baseClearAll');
    const saveBtn = document.getElementById('baseSave');

    if (!modalEl) return;
    const bsModal = Modal.getOrCreateInstance(modalEl);

    openBtn?.addEventListener('click', () => {
        buildGridInto(gridEl, titleEl);
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridEl);
        bsModal.show();
    });

    gridEl?.addEventListener('click', (e) => {
        const cell = e.target.closest('.time-slot');
        if (!cell) return;
        const [dLabel, hStr] = (cell.dataset.key || '').split('-');
        const hour = parseInt(hStr, 10);
        if (Number.isNaN(hour)) return;
        togglePatternCell(state, dLabel, hour);
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridEl);
    });

    clearBtn?.addEventListener('click', () => {
        state.baseStudyPattern = [];
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridEl);
    });

    saveBtn?.addEventListener('click', () => {
        // Close modal and re-render current week (derived pattern is merged in refilterVisibleWeek)
        bsModal.hide();
        refilterVisibleWeek(state, renderTasks);
    });
}
