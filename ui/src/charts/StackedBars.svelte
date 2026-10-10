<script>
  // Stacked bars per bucket: commits (bottom), PRs, work items (top).
  import { scaleBand, scaleLinear } from 'd3-scale';

  let { data = [], height = 160, width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 600);
  const M = { l: 36, r: 8, t: 8, b: 20 };
  const iw = $derived(Math.max(10, w - M.l - M.r));
  const ih = $derived(height - M.t - M.b);

  const x = $derived(scaleBand().domain(data.map((d) => d.key)).range([0, iw]).paddingInner(data.length > 120 ? 0.1 : 0.25));
  const max = $derived(Math.max(1, ...data.map((d) => d.commits + d.prs + d.items)));
  const y = $derived(scaleLinear().domain([0, max]).nice().range([ih, 0]));
  const ticks = $derived(y.ticks(3));
  const every = $derived(Math.max(1, Math.ceil(56 / Math.max(1, x.step()))));

  const bars = $derived(data.map((d, i) => {
    const total = d.commits + d.prs + d.items;
    return {
      key: d.key,
      label: d.label,
      x: x(d.key),
      bw: Math.max(1, x.bandwidth()),
      showLabel: i % every === 0,
      title: `${d.label}  ${d.commits} commits  ${d.prs} PRs  ${d.items} items`,
      segs: [
        { c: 'var(--commit)', y0: 0, y1: d.commits },
        { c: 'var(--pr)', y0: d.commits, y1: d.commits + d.prs },
        { c: 'var(--wi)', y0: d.commits + d.prs, y1: total }
      ].filter((s) => s.y1 > s.y0)
    };
  }));
</script>

<div class="wrap" bind:clientWidth={cw}>
  <svg width={w} height={height} style="display:block">
    <g transform={`translate(${M.l},${M.t})`}>
      {#each ticks as t (t)}
        <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
        <text x={-6} y={y(t) + 3} text-anchor="end">{t}</text>
      {/each}
      <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--line2)" />
      {#each bars as b (b.key)}
        <g>
          <title>{b.title}</title>
          {#each b.segs as s (s.c)}
            <rect x={b.x} y={y(s.y1)} width={b.bw} height={Math.max(0, y(s.y0) - y(s.y1))} fill={s.c} />
          {/each}
          {#if b.showLabel}
            <text x={b.x + b.bw / 2} y={ih + 14} text-anchor="middle">{b.label}</text>
          {/if}
        </g>
      {/each}
    </g>
  </svg>
</div>

<style>
  .wrap { width: 100%; }
</style>
