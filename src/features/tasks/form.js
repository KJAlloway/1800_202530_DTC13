// features/tasks/form.js
import { addTask } from '../../services/firestore.js';
import { Collapse } from 'bootstrap';

export function attachTaskForm() {
    const form = document.getElementById('taskForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('taskName')?.value?.trim() || '';
        const dueDate = document.getElementById('dueDate')?.value || '';
        const timeNeededRaw = document.getElementById('timeNeeded')?.value || '';
        const timeNeeded = parseFloat(timeNeededRaw);
        const importance = parseInt(document.getElementById('importance')?.value || '3', 10);

        if (!name || !dueDate || Number.isNaN(timeNeeded)) return;

        await addTask({ name, dueDate, timeNeeded, importance });

        e.target.reset();
        const collapse = document.getElementById('taskFormCollapse');
        if (collapse) Collapse.getOrCreateInstance(collapse).hide();
    });
}