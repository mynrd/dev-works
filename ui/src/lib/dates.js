// Local-day helpers. Every function works in the browser's local time zone.
// Date-like inputs: a Date, a "YYYY-MM-DD" string (local midnight), an ISO string, or ms.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const pad = (n) => String(n).padStart(2, '0');

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDate(x) {
  if (x instanceof Date) return x;
  if (typeof x === 'string' && YMD.test(x)) return parseYmd(x);
  return new Date(x);
}

export function ymd(x) {
  const d = toDate(x);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hm(x) {
  const d = toDate(x);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function startOfLocalDay(x) {
  const d = toDate(x);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfLocalDay(x) {
  const d = toDate(x);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(x, n) {
  const d = startOfLocalDay(x);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(x, n) {
  const d = startOfLocalDay(x);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Array of "YYYY-MM-DD" from `from` to `to` inclusive.
export function eachDay(from, to) {
  const out = [];
  let d = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  while (d <= end) {
    out.push(ymd(d));
    d = addDays(d, 1);
  }
  return out;
}

// 0 = Monday ... 6 = Sunday
export function weekday(x) {
  return (toDate(x).getDay() + 6) % 7;
}

export function mondayOf(x) {
  return addDays(x, -weekday(x));
}

export function isWorkingDay(x) {
  return weekday(x) < 5;
}

export function bucketKey(x, granularity) {
  const d = toDate(x);
  switch (granularity) {
    case 'week': return ymd(mondayOf(d));
    case 'month': return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    case 'year': return String(d.getFullYear());
    default: return ymd(d);
  }
}

export function bucketLabel(key, granularity) {
  switch (granularity) {
    case 'year': return key;
    case 'month': {
      const [y, m] = key.split('-').map(Number);
      return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
    }
    default: {
      const d = parseYmd(key);
      return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    }
  }
}

export function monthShort(x) {
  return MONTHS[toDate(x).getMonth()];
}

// Ordered unique bucket keys covering from..to.
export function bucketsBetween(from, to, granularity) {
  const keys = [];
  let last = null;
  for (const day of eachDay(from, to)) {
    const k = bucketKey(day, granularity);
    if (k !== last) { keys.push(k); last = k; }
  }
  return keys;
}

// Preset -> { from, to } as local "YYYY-MM-DD". 'sprint' is resolved by the
// caller from /api/iterations/current; 'custom' keeps the current values.
export function presets(preset, today = new Date()) {
  const to = ymd(today);
  switch (preset) {
    case '6m': return { from: ymd(addDays(addMonths(today, -6), 1)), to };
    case '3m': return { from: ymd(addDays(addMonths(today, -3), 1)), to };
    case '30d': return { from: ymd(addDays(today, -29)), to };
    case '12m':
    default: return { from: ymd(addDays(addMonths(today, -12), 1)), to };
  }
}

export const PRESETS = [
  { id: '12m', label: '12 m' },
  { id: '6m', label: '6 m' },
  { id: '3m', label: '3 m' },
  { id: '30d', label: '30 d' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'custom', label: 'Custom' }
];
