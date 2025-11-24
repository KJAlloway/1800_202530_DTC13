// src/state.js
/**
 * Single state object to be used by the entire app for consistency
 * Stores tasks
 * Stores studyBlocks
 * Set of available time slots
 * Stores time offset for difference in Firebase server time versus user time
 * Tracks how many weeks the user has navigated away from the current week
 */
export const state = {
  tasks: [],
  studyAll: [], // all study blocks (filter to visible week)
  studyBlocks: [], // visible week only
  availSlots: new Set(),
  clockOffsetMs: 0,
  weekOffset: 0,
};

export function now() {
  return new Date(Date.now() + (state.clockOffsetMs || 0));
}
