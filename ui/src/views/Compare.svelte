<script>
  import { app, accent, memberName, currentRange } from '../lib/state.svelte.js';
  import * as M from '../lib/metrics.js';
  import { fmt, fmt1, pct, days, hours } from '../lib/format.js';
  import Sparkline from '../charts/Sparkline.svelte';

  const a = $derived(app.activity);
  const range = $derived(currentRange());
  const members = $derived(app.settings.members);

  const COLS = [
    { id: 'commits', label: 'commits', f: (r) => fmt(r.commits) },
    { id: 'prs', label: 'prs completed', f: (r) => fmt(r.prs) },
    { id: 'resolved', label: 'items resolved', f: (r) => fmt(r.resolved) },
    { id: 'closed', label: 'items closed', f: (r) => fmt(r.closed) },
    { id: 'points', label: 'points', f: (r) => fmt1(r.points) },
    { id: 'cycle', label: 'cycle median', f: (r) => days(r.cycle) },
    { id: 'active', label: 'active ratio', f: (r) => pct(r.active) },
    { id: 'idle', label: 'idle gap wd', f: (r) => fmt(r.idle) },
    { id: 'turn', label: 'pr turnaround', f: (r) => hours(r.turn) },
    { id: 'reviews', label: 'reviews', f: (r) => fmt(r.reviews) },
    { id: 'bugs', label: 'bugs res / cre', f: (r) => `${fmt(r.bugsResolved)} / ${fmt(r.bugsCreated)}` }
  ];
  // columns where lower is better: sort ascending by default
  const ASC = new Set(['cycle', 'idle', 'turn']);

  let sort = $state({ id: 'commits', dir: -1 });

  function clickSort(id) {
    if (sort.id === id) sort = { id, dir: -sort.dir };
    else sort = { id, dir: ASC.has(id) ? 1 : -1 };
  }

  const rows = $derived.by(() => {
    if (!a) return [];
    return members.map((email) => {
      const cycle = M.cycleTimes(a, email, range).map((c) => c.days);
      const buckets = M.bucketSeries(a, email, range, 'week');
      return {
        email,
        name: memberName(email),
        commits: M.memberCommits(a, email, range).length,
        prs: M.prsCompleted(a, email, range).length,
        resolved: M.itemsResolved(a, email, range).length,
        closed: M.itemsClosed(a, email, range).length,
        points: M.pointsResolved(a, email, range),
        cycle: M.median(cycle),
        active: M.activeDaysRatio(a, email, range),
        idle: M.longestIdleGap(a, email, range),
        turn: M.prTurnaroundMedianHours(a, email, range),
        reviews: M.reviewsGiven(a, email, range).length,
        bugsResolved: M.bugsResolved(a, email, range).length,
        bugsCreated: M.bugsCreated(a, email, range).length,
        spark: buckets.map((b) => b.commits + b.items)
      };
    });
  });

  const sorted = $derived.by(() => {
    const key = sort.id === 'bugs' ? (r) => r.bugsResolved - r.bugsCreated : (r) => r[sort.id];
    return [...rows].sort((x, y) => {
      const vx = key(x), vy = key(y);
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1;
      if (vy == null) return -1;
      return (vx - vy) * sort.dir;
    });
  });
</script>

<div class="head">
  <span class="lbl">compare · {members.length} members</span>
  <span class="lbl right">{range.from} to {range.to} · sparkline = weekly commits + item events</span>
</div>

{#if !app.settings.org}
  <div class="empty">Enter org URL</div>
{:else if !members.length}
  <div class="empty">Pick members</div>
{:else if !a}
  <div class="empty">Run</div>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>member</th>
          {#each COLS as c (c.id)}
            <th class="num sortable" class:on={sort.id === c.id} onclick={() => clickSort(c.id)}>
              {c.label}{#if sort.id === c.id}<span class="dir">{sort.dir < 0 ? ' v' : ' ^'}</span>{/if}
            </th>
          {/each}
          <th>trend</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as r, i (r.email)}
          <tr>
            <td class="num dim">{i + 1}</td>
            <td class="who">
              <span class="sw" style={`background:${accent(r.email)}`}></span>
              <a href={`#/member/${encodeURIComponent(r.email)}`}>{r.name}</a>
            </td>
            {#each COLS as c (c.id)}
              <td class="num" class:on={sort.id === c.id}>{c.f(r)}</td>
            {/each}
            <td><Sparkline data={r.spark} color={accent(r.email)} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="lbl note">no combined score on purpose. idle gap and turnaround: lower is better. ratio = active Mon-Fri days / Mon-Fri days in range.</div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
  .head .right { margin-left: auto; }
  .scroll { overflow-x: auto; }
  .sortable { cursor: pointer; user-select: none; }
  .sortable:hover { color: var(--text); }
  th.on { color: var(--text); border-bottom-color: var(--text); }
  td.on { color: var(--text); }
  td { color: var(--muted); }
  .who { white-space: nowrap; color: var(--text); }
  .who a { color: var(--text); }
  .sw { display: inline-block; width: 8px; height: 8px; margin-right: 8px; }
  .dir { color: var(--text); }
  .note { padding: 10px 0; }
</style>
