// src/state.js
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