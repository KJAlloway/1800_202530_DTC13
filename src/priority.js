// src/priority.js
function calculatePriority(urgency, importance) {
  const urgencyMultiplier = 1.2;
  return urgency * urgencyMultiplier + importance;
}
function calculateUrgency(margin) {
  if (margin < 0.15) return 1;
  if (margin < 0.3) return 2;
  if (margin < 0.45) return 3;
  if (margin < 0.6) return 4;
  return 5;
}
function calculateSlackMargin(timeNeeded, timeAvailable) {
  return timeNeeded / Math.max(timeAvailable, 0.001);
}

// Testing
if (calculatePriority(calculateUrgency(calculateSlackMargin(2, 5)), 3) >= 7.5) {
  console.log("High Priority");
} else {
  console.log("Low priority");
}

if (calculatePriority(calculateUrgency(calculateSlackMargin(3, 5)), 2) >= 7.5) {
  console.log("High Priority");
} else {
  console.log("Low priority");
}
