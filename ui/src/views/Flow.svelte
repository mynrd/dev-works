<script>
  import { app, currentRange } from '../lib/state.svelte.js';
  import { flowSeries, DONE_STATES, inRange, doneDate } from '../lib/metrics.js';
  import { fmt } from '../lib/format.js';
  import Lines from '../charts/Lines.svelte';

  const a = $derived(app.activity);
  const range = $derived(currentRange());
  const gran = $derived(app.settings.granularity);

  const series = $derived(a ? flowSeries(a, range, gran) : []);
  const totals = $derived.by(() => {
    if (!a) return null;
    const created = a.workItems.filter((w) => inRange(w.created, range)).length;
    const resolved = a.workItems.filter((w) => inRange(doneDate(w), range)).length;
    const open = a.workItems.filter((w) => !DONE_STATES.has(w.state)).length;
    return { created, resolved, open };
  });
</script>

<div class="head">
  <span class="lbl">flow · {app.settings.areaPath || 'no area'}</span>
  <span class="lbl right">{range.from} to {range.to} · by {gran}</span>
</div>

{#if !app.settings.org}
  <div class="empty">Enter org URL</div>
{:else if !a}
  <div class="empty">Run</div>
{:else}
  <div class="totals">
    <div class="t"><div class="big">{fmt(totals.created)}</div><div class="lbl">created in range</div></div>
    <div class="t"><div class="big">{fmt(totals.resolved)}</div><div class="lbl">resolved / closed in range</div></div>
    <div class="t"><div class="big">{fmt(totals.open)}</div><div class="lbl">open now</div></div>
    <div class="t"><div class="big">{fmt(a.workItems.length)}</div><div class="lbl">items fetched</div></div>
  </div>
  <div class="sec"><span class="lbl">cumulative created vs resolved</span><span class="lbl">resolved = ResolvedDate, else ClosedDate</span></div>
  <Lines data={series} height={300} />
{/if}

<style>
  .head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
  .head .right { margin-left: auto; }
  .totals { display: flex; flex-wrap: wrap; gap: 0 28px; padding: 8px 0 14px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .t { padding: 8px 0 0; min-width: 90px; }
</style>
