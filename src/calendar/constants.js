// calendar/constants.js
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const HOURS = Array.from({ length: 17 }, (_, i) => 7 + i); // 7..23
export const fmtHour = (h) => `${(h % 12 === 0 ? 12 : h % 12)} ${h < 12 ? 'AM' : 'PM'}`;
