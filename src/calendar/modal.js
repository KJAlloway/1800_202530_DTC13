// calendar/modal.js
// This module wires up the "Base Schedule" modal.
// It is responsible for:
// - Building a calendar-like grid inside the modal.
// - Painting the base study pattern (weekday/hour pairs) into that grid.
// - Letting the user toggle cells to adjust the base pattern.
// - Clearing and saving the pattern, and updating the main calendar.

import { Modal } from 'bootstrap';
import { DAYS, HOURS, fmtHour } from './constants.js';
import { refilterVisibleWeek } from './grid.js';
import { saveBasePattern } from '../services/firestore.js';

/**
 * Build a calendar-like grid inside the provided container element.
 *
 * This grid:
 * - Has a corner cell, weekday headers, and hour labels.
 * - Uses the same DAYS and HOURS configuration as the main calendar.
 * - Does NOT show any date range or week title (modal-only).
 *
 * @param {HTMLElement|null} gridElement - The container for the modal grid.
 */
function buildGridInto(gridElement) {
    if (!gridElement) return;

    // Build weekday header cells (e.g., Mon, Tue, ...).
    const dayHeaderHtmlList = DAYS.map(
        (dayLabel) =>
            `<div class="day-header"><div>${dayLabel}</div></div>`,
    );

    // Corner cell at top-left, followed by the weekday headers.
    gridElement.innerHTML =
        `<div class="corner-cell"></div>` + dayHeaderHtmlList.join('');

    // For each hour, add one hour label on the left and one time-slot cell per day.
    HOURS.forEach((hour) => {
        // Hour label (e.g., "7 AM").
        gridElement.insertAdjacentHTML(
            'beforeend',
            `<div class="hour-label">${fmtHour(hour)}</div>`,
        );

        // One time-slot per day for this hour.
        DAYS.forEach((dayLabel) => {
            const key = `${dayLabel}-${hour}`;
            gridElement.insertAdjacentHTML(
                'beforeend',
                `<div class="time-slot" data-key="${key}"></div>`,
            );
        });
    });
}

/**
 * Paint base schedule "study" cells into the modal grid, based on
 * the given pattern of { weekday, hour } pairs.
 *
 * This function:
 * - Clears all existing study classes and labels from the grid.
 * - For each entry in the pattern, marks the corresponding cell
 *   as a base study slot and adds a label.
 *
 * @param {Array<{weekday:number, hour:number}>|undefined} pattern
 *   The base study pattern, described as weekday/hour pairs.
 * @param {HTMLElement|null} gridElement - The modal grid container.
 */
function hydrateBaseGridFromPattern(pattern, gridElement) {
    if (!gridElement) return;

    // Clear any existing "study" styling and labels from all cells.
    gridElement.querySelectorAll('.time-slot').forEach((slotElement) => {
        slotElement.classList.remove('study', 'study-base');
        slotElement.querySelector('.study-label')?.remove();
    });

    // Apply the base pattern. Each entry represents a weekday/hour pair.
    for (const { weekday, hour } of pattern || []) {
        const key = `${DAYS[weekday]}-${hour}`;
        const slotElement = gridElement.querySelector(
            `.time-slot[data-key="${key}"]`,
        );

        if (!slotElement) continue;

        // Mark this cell as a base study slot.
        slotElement.classList.add('study', 'study-base');

        // Create and append a label similar to the main calendar's.
        const label = document.createElement('span');
        label.className = 'study-label';
        label.innerHTML = 'Study<br>time';
        label.title = 'Study time';
        slotElement.appendChild(label);
    }
}

/**
 * Toggle a single weekday/hour pair in the state's baseStudyPattern.
 *
 * If the pair is already present, it is removed.
 * If the pair is not present, it is added.
 *
 * @param {object} state - Application state, including baseStudyPattern.
 * @param {string} dayLabel - One of the DAYS entries (e.g., "Mon").
 * @param {number} hour - An hour in 24-hour format (e.g., 7, 13).
 */
function togglePatternCell(state, dayLabel, hour) {
    const weekday = DAYS.indexOf(dayLabel);
    if (weekday < 0) return; // invalid day label, nothing to do

    // Ensure baseStudyPattern is initialized as an array.
    state.baseStudyPattern ||= [];

    // Find any existing pattern entry with the same weekday/hour.
    const existingIndex = state.baseStudyPattern.findIndex(
        (entry) => entry.weekday === weekday && entry.hour === hour,
    );

    if (existingIndex >= 0) {
        // If found, remove it (toggle off).
        state.baseStudyPattern.splice(existingIndex, 1);
    } else {
        // If not found, add it (toggle on).
        state.baseStudyPattern.push({ weekday, hour });
    }
}

/**
 * Public initializer: attach all event handlers for the Base Schedule modal.
 *
 * This function:
 * - Connects the "Open Base Schedule" button to building and showing the modal.
 * - Lets the user click cells in the modal grid to toggle the base pattern.
 * - Clears the pattern when "Clear All" is clicked.
 * - Saves the pattern to Firestore when "Save" is clicked and then triggers:
 *   - refilterVisibleWeek(state) to update the main calendar.
 *   - renderTasks(state) to refresh task rendering.
 *
 * @param {object} state - Application state object.
 * @param {function} renderTasks - Function that re-renders tasks using the state.
 */
export function initBaseScheduleModal(state, renderTasks) {
    // Grab all relevant DOM elements for the modal.
    const openButton = document.getElementById('openBaseSchedule');
    const modalElement = document.getElementById('baseScheduleModal');
    const gridElement = document.getElementById('baseScheduleGrid');
    const titleElement = document.getElementById('baseScheduleTitle'); // we clear this text
    const clearButton = document.getElementById('baseClearAll');
    const saveButton = document.getElementById('baseSave');

    // If there is no modal element in the DOM, do not wire anything.
    if (!modalElement) return;

    // Get or create the Bootstrap Modal instance that controls this element.
    const baseScheduleModal = Modal.getOrCreateInstance(modalElement);

    // When the "Open Base Schedule" button is clicked, build the grid,
    // paint the current pattern, and show the modal.
    openButton?.addEventListener('click', () => {
        // Remove any title text; the base schedule modal does not show a date range.
        if (titleElement) {
            titleElement.textContent = '';
        }

        // Build the blank grid structure and then apply the existing pattern.
        buildGridInto(gridElement);
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridElement);

        // Show the modal via Bootstrap.
        baseScheduleModal.show();
    });

    // Handle clicks within the grid using event delegation.
    gridElement?.addEventListener('click', (event) => {
        // Find the nearest .time-slot ancestor for the click target.
        const cell = event.target.closest('.time-slot');
        if (!cell) return;

        // Read the data-key (e.g., "Mon-7") and split into day label and hour string.
        const [dayLabel, hourString] = (cell.dataset.key || '').split('-');
        const hour = parseInt(hourString, 10);

        // If the hour could not be parsed, do nothing.
        if (Number.isNaN(hour)) return;

        // Update the underlying base pattern and repaint the grid.
        togglePatternCell(state, dayLabel, hour);
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridElement);
    });

    // When "Clear All" is clicked, empty the base pattern and repaint.
    clearButton?.addEventListener('click', () => {
        state.baseStudyPattern = [];
        hydrateBaseGridFromPattern(state.baseStudyPattern, gridElement);
    });

    // When "Save" is clicked, persist the pattern, close the modal,
    // and refresh the main calendar and tasks.
    saveButton?.addEventListener('click', async () => {
        try {
            // Persist the current base pattern to Firestore (backend).
            await saveBasePattern(state.baseStudyPattern);
        } catch (error) {
            console.error('[BASE] save pattern failed', error);
        }

        // Remove focus from the button to avoid accessibility warnings when
        // the modal is hidden (focus should not remain on an invisible element).
        saveButton.blur();

        // Hide the modal via Bootstrap's API.
        baseScheduleModal.hide();

        // Recompute visible blocks and repaint the main calendar.
        // Once that is done, call renderTasks(state) to refresh tasks.
        refilterVisibleWeek(state, () => renderTasks(state));
    });
}
