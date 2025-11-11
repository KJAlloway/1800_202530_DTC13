// Returns array of current [month, day, hour, minute]
function getDate() {
  const current_time = new Date();
  const month = current_time.getMonth() + 1;
  const day = current_time.getDate();
  const hour = current_time.getHours();
  const minute = current_time.getMinutes();
  return [month, day, hour, minute];
}

// Testing
const MONTH = 0;
const DAY = 1;
const HOUR = 2;
const MINUTE = 3;
let now = new Date();

console.log(now); // Milliseconds since start of year
console.log(getDate()); // Current month, day, hour, and minute

console.log("The month is " + getDate()[MONTH]);
console.log("The day is " + getDate()[DAY]);
console.log("The hour is " + getDate()[HOUR]);
console.log("The minute is " + getDate()[MINUTE]);