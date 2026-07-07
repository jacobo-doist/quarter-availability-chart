// Date helpers and the quarter-window rule.
// All dates are handled in UTC to keep day arithmetic free of timezone drift.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const parseISO = (s) => new Date(s + 'T00:00:00Z');
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const fmt = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
export const daysWord = (n) => (n === 1 ? '1 day' : `${n} days`);

const dow = (d) => d.getUTCDay();                 // 0 Sun .. 6 Sat
const isBusiness = (d) => dow(d) >= 1 && dow(d) <= 5;

function firstMonday(d) {
  let cur = d;
  while (dow(cur) !== 1) cur = addDays(cur, 1);
  return cur;
}

// [start, end] inclusive for a "YYYYQn" quarter, as whole weeks: it starts on
// the first full working week of the quarter and ends the week before the next
// quarter starts — always 12 or 13 whole weeks.
export function quarterWindow(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(q);
  if (!m) throw new Error(`bad quarter '${q}', expected e.g. 2026Q3`);
  const year = +m[1], qn = +m[2];
  const startMonth = (qn - 1) * 3;                // 0-indexed
  const naturalStart = new Date(Date.UTC(year, startMonth, 1));
  const nextStart = new Date(Date.UTC(qn === 4 ? year + 1 : year, qn === 4 ? 0 : startMonth + 3, 1));
  const start = firstMonday(naturalStart);         // first full week of the quarter
  const end = addDays(firstMonday(nextStart), -1); // week before the next quarter
  return [start, end];
}

export function businessDays(a, b) {
  const out = [];
  for (let cur = a; cur <= b; cur = addDays(cur, 1)) if (isBusiness(cur)) out.push(cur);
  return out;
}
