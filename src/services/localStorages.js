//localStorage.js
export const TASKS_KEY = 'tasks';

export function saveTasksLocally(tasks) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function loadTasksFromLocal() {
    const data = localStorage.getItem(TASKS_KEY);
    return data ? JSON.parse(data) : [];
}
