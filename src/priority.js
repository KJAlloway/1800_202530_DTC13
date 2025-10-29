// src/priority.js
export function calculatePriority(urgency, importance) {
    const urgencyMultiplier = 1.2;
    return urgency * urgencyMultiplier + importance;
}
export function calculateUrgency(margin) {
    if (margin < 0.15) return 1;
    if (margin < 0.30) return 2;
    if (margin < 0.45) return 3;
    if (margin < 0.60) return 4;
    return 5;
}
export function calculateSlackMargin(timeNeeded, timeAvailable) {
    return timeNeeded / Math.max(timeAvailable, 0.001);
}
