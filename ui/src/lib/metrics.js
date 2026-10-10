// Pure metric functions over an Activity (see CONTRACT.md) + member email + range.
// range = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } in local days. No DOM.

import { ymd, hm, eachDay, isWorkingDay, bucketKey, bucketLabel, bucketsBetween, weekday, endOfLocalDay } from './dates.js';

const DAY = 86400000;
const HOUR = 3600000;
export const DONE_STATES = new Set(['Resolved', 'Closed', 'Removed', 'Done']);

export function inRange(iso, range) {
  if (!iso) return false;
  const k = ymd(new Date(iso));
  return k >= range.from && k <= range.to;
}

export function median(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Resolved date, falling back to closed for processes without a Resolved state.
export const doneDate = (w) => w.resolved || w.closed || null;

// ---- commits / PRs ---------------------------------------------------------

export function memberCommits(a, email, range) {
  return a.commits.filter((c) => !c.isMerge && c.email === email && inRange(c.date, range));
}

export function prsCreated(a, email, range) {
  return a.prs.filter((p) => p.createdBy === email && inRange(p.created, range));
}

export function prsCompleted(a, email, range) {
  return a.prs.filter((p) => p.createdBy === email && p.status === 'completed' && inRange(p.closed, range));
}

export function reviewsGiven(a, email, range) {
  return a.prs.filter((p) =>
    p.createdBy !== email &&
    (inRange(p.created, range) || inRange(p.closed, range)) &&
    p.reviewers.some((r) => r.email === email && r.vote !== 0)
  );
}

export function prTurnaroundMedianHours(a, email, range) {
  return median(prsCompleted(a, email, range).map((p) => (Date.parse(p.closed) - Date.parse(p.created)) / HOUR));
}

// ---- work items ------------------------------------------------------------

export function itemsCreated(a, email, range) {
  return a.workItems.filter((w) => w.assignedTo === email && inRange(w.created, range));
}

export function itemsResolved(a, email, range) {
  return a.workItems.filter((w) => w.assignedTo === email && inRange(w.resolved, range));
}

export function itemsClosed(a, email, range) {
  return a.workItems.filter((w) => w.assignedTo === email && inRange(w.closed, range));
}

export function pointsResolved(a, email, range) {
  return itemsResolved(a, email, range).reduce((s, w) => s + (w.points || 0), 0);
}

// [{ item, resolved: ISO, days }] one per resolved item
export function cycleTimes(a, email, range) {
  return itemsResolved(a, email, range)
    .map((w) => ({
      item: w,
      resolved: w.resolved,
      days: (Date.parse(w.resolved) - Date.parse(w.activated || w.created)) / DAY
    }))
    .filter((x) => Number.isFinite(x.days) && x.days >= 0)
    .sort((x, y) => Date.parse(x.resolved) - Date.parse(y.resolved));
}

export function cycleTimeMedian(a, email, range) {
  return median(cycleTimes(a, email, range).map((x) => x.days));
}

export function bugsCreated(a, email, range) {
  return itemsCreated(a, email, range).filter((w) => w.type === 'Bug');
}

export function bugsResolved(a, email, range) {
  return itemsResolved(a, email, range).filter((w) => w.type === 'Bug');
}

// [{ label, value }] commits per repo, descending
export function repoMix(a, email, range) {
  const m = new Map();
  for (const c of memberCommits(a, email, range)) m.set(c.repoName, (m.get(c.repoName) || 0) + 1);
  return [...m].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
}

// [{ type, created, resolved }]
export function typeSplit(a, email, range) {
  const m = new Map();
  const get = (t) => { if (!m.has(t)) m.set(t, { type: t, created: 0, resolved: 0 }); return m.get(t); };
  for (const w of itemsCreated(a, email, range)) get(w.type).created++;
  for (const w of itemsResolved(a, email, range)) get(w.type).resolved++;
  return [...m.values()].sort((x, y) => (y.created + y.resolved) - (x.created + x.resolved));
}

// [{ item, ageDays }] assigned, open, oldest first
export function agingOpenItems(a, email, now = Date.now()) {
  return a.workItems
    .filter((w) => w.assignedTo === email && !DONE_STATES.has(w.state))
    .map((w) => ({ item: w, ageDays: (now - Date.parse(w.created)) / DAY }))
    .sort((x, y) => y.ageDays - x.ageDays);
}

// ---- days / series ---------------------------------------------------------

// Map ymd -> { commits, prs, items } for every day in range.
export function dailySeries(a, email, range) {
  const m = new Map();
  for (const d of eachDay(range.from, range.to)) m.set(d, { commits: 0, prs: 0, items: 0 });
  const bump = (iso, k) => {
    if (!iso) return;
    const row = m.get(ymd(new Date(iso)));
    if (row) row[k]++;
  };
  for (const c of a.commits) if (!c.isMerge && c.email === email) bump(c.date, 'commits');
  for (const p of a.prs) if (p.createdBy === email) { bump(p.created, 'prs'); bump(p.closed, 'prs'); }
  for (const w of a.workItems) if (w.assignedTo === email) { bump(w.created, 'items'); bump(w.resolved, 'items'); bump(w.closed, 'items'); }
  return m;
}

// Set of ymd with any commit, PR event, or item event
export function activeDays(a, email, range) {
  const s = new Set();
  for (const [d, r] of dailySeries(a, email, range)) if (r.commits || r.prs || r.items) s.add(d);
  return s;
}

// active Mon-Fri days / Mon-Fri days in range
export function activeDaysRatio(a, email, range) {
  const days = activeDays(a, email, range);
  const wd = eachDay(range.from, range.to).filter(isWorkingDay);
  if (!wd.length) return 0;
  return wd.filter((d) => days.has(d)).length / wd.length;
}

// longest run of Mon-Fri days with no activity, counted in working days
export function longestIdleGap(a, email, range) {
  const days = activeDays(a, email, range);
  let best = 0, run = 0;
  for (const d of eachDay(range.from, range.to)) {
    if (!isWorkingDay(d)) continue;
    if (days.has(d)) run = 0;
    else { run++; if (run > best) best = run; }
  }
  return best;
}

// [{ key, label, commits, prs, items }] ordered by bucket
export function bucketSeries(a, email, range, granularity) {
  const keys = bucketsBetween(range.from, range.to, granularity);
  const m = new Map(keys.map((k) => [k, { key: k, label: bucketLabel(k, granularity), commits: 0, prs: 0, items: 0 }]));
  for (const [d, r] of dailySeries(a, email, range)) {
    const b = m.get(bucketKey(d, granularity));
    if (!b) continue;
    b.commits += r.commits; b.prs += r.prs; b.items += r.items;
  }
  return [...m.values()];
}

// 7 rows (Mon..Sun) x 24 hours of commit counts, local time
export function rhythm(a, email, range) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of memberCommits(a, email, range)) {
    const d = new Date(c.date);
    grid[weekday(d)][d.getHours()]++;
  }
  return grid;
}

// ---- team level ------------------------------------------------------------

// [{ key, label, created, resolved, cumCreated, cumResolved, wip }]
// resolved uses ResolvedDate, falling back to ClosedDate. wip = items created
// on or before the bucket's last day and not yet resolved/closed by then.
export function flowSeries(a, range, granularity) {
  const keys = bucketsBetween(range.from, range.to, granularity);
  const rows = keys.map((k) => ({ key: k, label: bucketLabel(k, granularity), created: 0, resolved: 0, cumCreated: 0, cumResolved: 0, wip: 0 }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const bucketEnd = new Array(keys.length).fill(null); // ms of end of last local day in bucket
  for (const d of eachDay(range.from, range.to)) {
    const i = idx.get(bucketKey(d, granularity));
    if (i != null) bucketEnd[i] = endOfLocalDay(d).getTime();
  }
  const items = a.workItems.map((w) => ({ c: Date.parse(w.created), r: doneDate(w) ? Date.parse(doneDate(w)) : null, w }));
  for (const it of items) {
    if (inRange(it.w.created, range)) rows[idx.get(bucketKey(it.w.created, granularity))].created++;
    const dd = doneDate(it.w);
    if (dd && inRange(dd, range)) rows[idx.get(bucketKey(dd, granularity))].resolved++;
  }
  let cc = 0, cr = 0;
  rows.forEach((r, i) => {
    cc += r.created; cr += r.resolved;
    r.cumCreated = cc; r.cumResolved = cr;
    const end = bucketEnd[i];
    r.wip = items.filter((it) => it.c <= end && (it.r == null || it.r > end)).length;
  });
  return rows;
}

// ---- digest ----------------------------------------------------------------

const VOTE = { 10: 'approved', 5: 'approved with suggestions', '-5': 'waiting for author', '-10': 'rejected' };

// Events for one member in [fromISO, toISO], sorted by time.
// { t: ms, kind: 'C'|'PR'|'WI', text, detail, url, approx }
export function dayEvents(a, email, fromISO, toISO) {
  const lo = Date.parse(fromISO), hi = Date.parse(toISO);
  const win = (iso) => { if (!iso) return false; const t = Date.parse(iso); return t >= lo && t <= hi; };
  const ev = [];

  for (const c of a.commits) {
    if (c.isMerge || c.email !== email || !win(c.date)) continue;
    const files = (c.add || 0) + (c.edit || 0) + (c.del || 0);
    ev.push({ t: Date.parse(c.date), kind: 'C', text: c.message, detail: `${c.repoName} · ${files} file${files === 1 ? '' : 's'}`, url: c.url, approx: false });
  }

  for (const p of a.prs) {
    if (p.createdBy === email) {
      if (win(p.created)) ev.push({ t: Date.parse(p.created), kind: 'PR', text: `opened #${p.id} ${p.title}`, detail: `${p.repoName} ${p.source} -> ${p.target}`, url: p.url, approx: false });
      if (p.closed && win(p.closed) && p.status !== 'active') ev.push({ t: Date.parse(p.closed), kind: 'PR', text: `${p.status} #${p.id} ${p.title}`, detail: `${p.repoName}${p.mergeStrategy ? ' ' + p.mergeStrategy : ''}`, url: p.url, approx: false });
    } else {
      const rv = p.reviewers.find((r) => r.email === email && r.vote !== 0);
      if (!rv) continue;
      // vote time is unknown: use PR closed date if in window, else created date
      const ts = p.closed && win(p.closed) ? p.closed : (win(p.created) ? p.created : null);
      if (!ts) continue;
      ev.push({ t: Date.parse(ts), kind: 'PR', text: `${VOTE[rv.vote] || 'voted ' + rv.vote} #${p.id} ${p.title}`, detail: `${p.repoName} by ${p.createdBy}`, url: p.url, approx: true });
    }
  }

  const byId = new Map(a.workItems.map((w) => [w.id, w]));
  const updates = a.updates || [];
  if (updates.length) {
    for (const u of updates) {
      if (u.by !== email || !win(u.date)) continue;
      const w = byId.get(u.itemId);
      const head = `#${u.itemId} ${w ? w.title : ''}`;
      const url = w ? w.url : null;
      const detail = w ? w.type : '';
      if (u.created) {
        // creation folds the initial state and assignee into one line
        const to = u.assignedTo?.new ? ` -> ${u.assignedTo.new}` : '';
        ev.push({ t: Date.parse(u.date), kind: 'WI', text: `created ${head}${to}`, detail, url, approx: false });
        continue;
      }
      if (u.state) ev.push({ t: Date.parse(u.date), kind: 'WI', text: `${u.state.old || 'new'} -> ${u.state.new} ${head}`, detail, url, approx: false });
      if (u.assignedTo) ev.push({ t: Date.parse(u.date), kind: 'WI', text: `reassigned ${u.assignedTo.old || 'nobody'} -> ${u.assignedTo.new || 'nobody'} ${head}`, detail, url, approx: false });
      if (u.comment) ev.push({ t: Date.parse(u.date), kind: 'WI', text: `commented on ${head}`, detail: u.comment.length > 160 ? u.comment.slice(0, 159) + '…' : u.comment, url, approx: false });
    }
  } else {
    // no updates fetched: fall back to item dates
    for (const w of a.workItems) {
      const head = `#${w.id} ${w.title}`;
      if (w.createdBy === email && win(w.created)) ev.push({ t: Date.parse(w.created), kind: 'WI', text: `created ${head}`, detail: w.type, url: w.url, approx: false });
      if (w.resolvedBy === email && win(w.resolved)) ev.push({ t: Date.parse(w.resolved), kind: 'WI', text: `resolved ${head}`, detail: w.type, url: w.url, approx: false });
      if (w.closedBy === email && win(w.closed)) ev.push({ t: Date.parse(w.closed), kind: 'WI', text: `closed ${head}`, detail: w.type, url: w.url, approx: false });
    }
  }

  const seen = new Set();
  return ev
    .filter((e) => { const k = `${e.t}|${e.kind}|${e.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.t - y.t);
}

// Plain text for Slack.
export function standupText(email, events, label = '') {
  const lines = [`${email}${label ? ' - ' + label : ''}`];
  if (!events.length) lines.push('- no activity');
  const multiDay = new Set(events.map((e) => ymd(new Date(e.t)))).size > 1;
  let lastDay = null;
  for (const e of events) {
    const day = ymd(new Date(e.t));
    if (multiDay && day !== lastDay) lines.push(day);
    lastDay = day;
    const time = (e.approx ? '~' : '') + hm(new Date(e.t));
    lines.push(`- ${time} [${e.kind}] ${e.text}${e.detail ? ' (' + e.detail + ')' : ''}`);
  }
  return lines.join('\n');
}
