// src/state.js
export const state = {
    tasks: [],
    eventsAll: [], // all events (we'll filter to visible week)
    studyAll: [], // all study blocks (filter to visible week)
    studyBlocks: [], // visible week only
    events: [], // visible week only
    availSlots: new Set(),
    clockOffsetMs: 0,
    weekOffset: 0,
};


export function now() {
    return new Date(Date.now() + (state.clockOffsetMs || 0));
}