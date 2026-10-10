<script>
  // Cycle time strip: one dot per resolved item. x = resolved date, y = days (symlog), median line.
  import { scaleTime, scaleSymlog } from 'd3-scale';
  import { parseYmd, endOfLocalDay, monthShort } from '../lib/dates.js';

  let { data = [], from, to, median = null, height = 150, width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 600);
  const M = { l: 36, r: 10, t: 10, b: 20 };
  const iw = $derived(Math.max(10, w - M.l - M.r));
  const ih = $derived(height - M.t - M.b);

  const x = $derived(scaleTime().domain([parseYmd(from), endOfLocalDay(to)]).range([0, iw]));
  const max = $derived(Math.max(1, ...data.map((d) => d.days)));
  const y = $derived(scaleSymlog().domain([0, max]).range([ih, 0]));
  const yticks = $derived.by(() => {
    const t = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter((v) => v <= max);
    return t.length > 1 ? t : [0, Math.ceil(max)];
  });
  const spanDays = $derived((endOfLocalDay(to) - parseYmd(from)) / 86400000);
  const xticks = $derived(x.ticks(Math.max(2, Math.floor(iw / 90))));
  const xf = (d) => spanDays > 200 ? `${monthShort(d)} ${String(d.getFullYear()).slice(2)}` : `${monthShort(d)} ${d.getDate()}`;

  const dots = $derived(data.map((d, i) => ({
    k: d.id ?? i,
    cx: x(new Date(d.date)),
    cy: y(d.days),
    title: `${d.title || ''}  ${Math.round(d.days * 10) / 10} d`,
    url: d.url
  })));
</script>

<div class="wrap" bind:clientWidth={cw}>
  <svg width={w} height={height} style="display:block">
    <g transform={`translate(${M.l},${M.t})`}>
      {#each yticks as t (t)}
        <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
        <text x={-6} y={y(t) + 3} text-anchor="end">{t}</text>
      {/each}
      {#each xticks as t (t.getTime())}
        <text x={x(t)} y={ih + 14} text-anchor="middle">{xf(t)}</text>
      {/each}
      <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--line2)" />
      {#if median != null}
        <line x1={0} x2={iw} y1={y(median)} y2={y(median)} stroke="var(--text)" stroke-dasharray="3 3" />
        <text x={iw} y={y(median) - 3} text-anchor="end" fill="var(--text)">median {Math.round(median * 10) / 10} d</text>
      {/if}
      {#each dots as d (d.k)}
        {#if d.url}
          <a href={d.url} target="_blank" rel="noreferrer">
            <circle cx={d.cx} cy={d.cy} r={3} fill="var(--wi)" opacity={0.8}><title>{d.title}</title></circle>
          </a>
        {:else}
          <circle cx={d.cx} cy={d.cy} r={3} fill="var(--wi)" opacity={0.8}><title>{d.title}</title></circle>
        {/if}
      {/each}
    </g>
  </svg>
</div>

<style>
  .wrap { width: 100%; }
  circle:hover { opacity: 1; stroke: var(--text); }
</style>
