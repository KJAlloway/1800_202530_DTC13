// features/tasks/render.js
import { calculatePriority, calculateUrgency, calculateSlackMargin } from '../../priority.js';
import { toggleTaskComplete, deleteTask } from '../../services/firestore.js';

function overlapMs(aStart, aEnd, bStart, bEnd) {
    const s = Math.max(aStart.getTime(), bStart.getTime());
    const e = Math.min(aEnd.getTime(), bEnd.getTime());
    return Math.max(0, e - s);
}

function studyMinutesUntil(dueDateStr, state, now) {
    const n = now();
    const due = new Date(`${dueDateStr}T23:59:59`);
    if (Number.isNaN(due.getTime()) || due <= n) return 0;

    let minutes = 0;
    for (const block of state.studyBlocks) {
        const segStart = new Date(Math.max(block.start.getTime(), n.getTime()));
        const segEnd = new Date(Math.min(block.end.getTime(), due.getTime()));
        if (segEnd <= segStart) continue;

        let busyMs = 0;
        for (const ev of state.events) busyMs += overlapMs(segStart, segEnd, ev.start, ev.end);
        const freeMs = Math.max(0, (segEnd - segStart) - busyMs);
        minutes += freeMs / 60000;
    }
    return minutes;
}

function priorityForTask(task, state, now) {
    const studyMins = studyMinutesUntil(task.dueDate, state, now);
    const timeAvail = studyMins / 60;
    const margin = calculateSlackMargin(task.timeNeeded, timeAvail);
    const urgency = calculateUrgency(margin);
    const score = calculatePriority(urgency, task.importance ?? 3);
    return { timeAvail, margin, urgency, score };
}

export function renderTasks(state, now) {
    const list = document.getElementById('taskList');
    const emptyMsg = document.getElementById('noTasksMsg');
    if (!list) return;

    const scored = state.tasks
        .map(t => ({ t, p: priorityForTask(t, state, now) }))
        .sort((a, b) => b.p.score - a.p.score);

    list.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.toggle('visible', scored.length === 0);

    scored.forEach(({ t, p }) => {
        const due = new Date(t.dueDate);
        const date = isNaN(due) ? '—' : due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const urgency = p.urgency;
        const color =
            urgency >= 5 ? 'border-danger' :
                urgency >= 3 ? 'border-warning' : 'border-success';

        const col = document.createElement('div');
        col.className = 'col-12 col-md-6 col-lg-4';
        col.innerHTML = `
      <div class="card shadow-sm border-0 border-start border-4 ${color}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="card-title mb-0 ${t.completed ? 'text-decoration-line-through' : ''}">${t.name}</h5>
            <span class="badge ${color.replace('border', 'bg')} text-light">${t.importance ?? 3}/5</span>
          </div>
          <p class="mb-1"><strong>Due:</strong> ${date}</p>
          <p class="mb-1"><strong>Study hrs left:</strong> ${p.timeAvail.toFixed(1)}</p>
          <p class="mb-2"><strong>Slack ratio:</strong> ${p.margin.toFixed(2)}</p>
          <div class="d-flex justify-content-between">
            <button class="btn btn-sm ${t.completed ? 'btn-secondary' : 'btn-success'} toggle-complete">
              ${t.completed ? 'Undo' : 'Complete'}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-task">Delete</button>
          </div>
        </div>
      </div>`;

        col.querySelector('.toggle-complete')?.addEventListener('click', async () => {
            await toggleTaskComplete(t.id, !t.completed);
        });
        col.querySelector('.delete-task')?.addEventListener('click', async () => {
            await deleteTask(t.id);
        });

        list.appendChild(col);
    });
}
