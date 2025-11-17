//localStorage.js
/**
 * Creates a constant exported key for any time we want to access tasks.
 * Helps prevent issues with misspelling
 */
export const TASKS_KEY = "tasks";

/** Save tasks locally
 * Turns array of (passed in) tasks into string for storage,
 * because localStorage only stores strings
 *
 */
export function saveTasksLocally(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/**
 * gets the value of tasks stored in localStorage
 * if the data doesn't exist (no tasks found) returns an empty array
 * if there is data, parse the JSON string into a js array and return it
 */
export function loadTasksFromLocal() {
  const data = localStorage.getItem(TASKS_KEY);
  return data ? JSON.parse(data) : [];
}
