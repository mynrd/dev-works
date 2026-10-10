const nf = new Intl.NumberFormat('en-US');

export function fmt(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return nf.format(n);
}

export function fmt1(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function pct(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return `${Math.round(n * 100)}%`;
}

export function hours(h) {
  if (h == null || Number.isNaN(h)) return '-';
  if (h < 48) return `${fmt1(h)} h`;
  return `${fmt1(h / 24)} d`;
}

export function days(d) {
  if (d == null || Number.isNaN(d)) return '-';
  return `${fmt1(d)} d`;
}

export function shortEmail(email) {
  return (email || '').split('@')[0];
}

export function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
