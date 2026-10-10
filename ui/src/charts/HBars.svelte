<script>
  // Horizontal bars with a text label on the left and the value on the right.
  import { scaleLinear } from 'd3-scale';
  import { truncate } from '../lib/format.js';

  let { data = [], color = 'var(--commit)', rowH = 18, labelW = 150, width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 400);
  const VAL = 44;
  const iw = $derived(Math.max(10, w - labelW - VAL));
  const max = $derived(Math.max(1, ...data.map((d) => d.value)));
  const x = $derived(scaleLinear().domain([0, max]).range([0, iw]));
  const chars = $derived(Math.max(6, Math.floor(labelW / 6.6)));
</script>

<div class="wrap" bind:clientWidth={cw}>
  <svg width={w} height={Math.max(rowH, data.length * rowH)} style="display:block">
    {#each data as d, i (d.label)}
      <g transform={`translate(0,${i * rowH})`}>
        <title>{d.label}  {d.value}</title>
        <text x={labelW - 8} y={rowH / 2 + 3.5} text-anchor="end" fill="var(--text)">{truncate(d.label, chars)}</text>
        <rect x={labelW} y={3} width={Math.max(1, x(d.value))} height={rowH - 6} fill={color} opacity={0.85} />
        <text x={labelW + x(d.value) + 6} y={rowH / 2 + 3.5}>{d.value}</text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .wrap { width: 100%; }
</style>
