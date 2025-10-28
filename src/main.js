// import 'bootstrap/dist/css/bootstrap.min.css';
// import 'bootstrap';

// Use urgency level and importance level to calculate priority
function calculatePriority(urgency, importance) {
  // urgencyMultiplier is needed because urgency take priority over same level importance
  let urgencyMultiplier = 1.2;
  let priorityLevel = urgency * urgencyMultiplier + importance;
  return priorityLevel;
}

// Use time margin to calculate urgency level
function calculateUrgency(margin) {
  let urgency = null;
  switch (true) {
    case margin < 0.15:
      urgency = 1;
      break;
    case margin < 0.3:
      urgency = 2;
      break;
    case margin < 0.45:
      urgency = 3;
      break;
    case margin < 0.6:
      urgency = 4;
      break;
    default:
      urgency = 5;
      break;
  }
  return urgency;
}

// Use time needed, time left to calculate margin
function calculateSlackMargin(timeNeeded, timeAvailable) {
  let margin = timeNeeded / timeAvailable;
  return margin;
}

function sayHello() {}
// document.addEventListener('DOMContentLoaded', sayHello);
