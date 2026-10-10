<script>
  // Two cumulative lines (created, resolved) plus optional WIP bars per bucket.
  import { scaleBand, scaleLinear } from 'd3-scale';
  import { line as d3line, curveMonotoneX } from 'd3-shape';

  let { data = [], height = 240, showWip = true, width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 600);
  const M = { l: 40, r: 8, t: 10, b: 20 };
  const iw = $derived(Math.max(10, w - M.l - M.r));
  const ih = $derived(height - M.t - M.b);

  const x = $derived(scaleBand().domain(data.map((d) => d.key)).range([0, iw]).paddingInner(0.3));
  const cx = (k) => x(k) + x.bandwidth() / 2;
  const max = $derived(Math.max(1, ...data.map((d) => Math.max(d.cumCreated, d.cumResolved, showWip ? d.wip : 0))));
  const y = $derived(scaleLinear().domain([0, max]).nice().range([ih, 0]));
  const ticks = $derived(y.ticks(4));
  const every = $derived(Math.max(1, Math.ceil(56 / Math.max(1, x.step()))));

  const created = $derived(d3line().x((d) => cx(d.key)).y((d) => y(d.cumCreated)).curve(curveMonotoneX)(data) || '');
  const resolved = $derived(d3line().x((d) => cx(d.key)).y((d) => y(d.cumResolved)).curve(curveMonotoneX)(data) || '');
</script>

<div class="wrap" bind:clientWidth={cw}>
  <div class="legend lbl">
    <span><i style="background:var(--pr)"></i> created (cumulative)</span>
    <span><i style="background:var(--wi)"></i> resolved (cumulative)</span>
    {#if showWip}<span><i style="background:var(--dim)"></i> wip (open at bucket end)</span>{/if}
  </div>
  <svg width={w} height={height} style="display:block">
    <g transform={`translate(${M.l},${M.t})`}>
      {#each ticks as t (t)}
        <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
        <text x={-6} y={y(t) + 3} text-anchor="end">{t}</text>
      {/each}
      <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--line2)" />
      {#if showWip}
        {#each data as d (d.key)}
          <rect x={x(d.key)} y={y(d.wip)} width={Math.max(1, x.bandwidth())} height={Math.max(0, ih - y(d.wip))} fill="var(--dim)" opacity={0.5}>
            <title>{d.label}  wip {d.wip}  created {d.cumCreated}  resolved {d.cumResolved}</title>
          </rect>
        {/each}
      {/if}
      <path d={created} fill="none" stroke="var(--pr)" stroke-width={1.5} />
      <path d={resolved} fill="none" stroke="var(--wi)" stroke-width={1.5} />
      {#each data as d, i (d.key)}
        {#if i % every === 0}
          <text x={cx(d.key)} y={ih + 14} text-anchor="middle">{d.label}</text>
        {/if}
      {/each}
    </g>
  </svg>
</div>

<style>
  .wrap { width: 100%; }
  .legend { display: flex; gap: 18px; padding: 0 0 8px; }
  .legend i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px; }
</style>
