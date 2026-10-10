<script>
  // 7 x 24 grid: weekday rows (Mon..Sun), hour columns, commit count intensity.
  import { scaleSqrt } from 'd3-scale';

  let { data = [], width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 600);
  const GUT = 32, TOP = 14, GAP = 2;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const cell = $derived(Math.max(8, Math.min(22, Math.floor((w - GUT) / 24) - GAP)));
  const step = $derived(cell + GAP);
  const max = $derived(Math.max(1, ...data.flat()));
  const o = $derived(scaleSqrt().domain([0, max]).range([0.25, 1]));

  const cells = $derived.by(() => {
    const out = [];
    data.forEach((row, r) => row.forEach((v, h) => out.push({ k: `${r}-${h}`, r, h, v, x: GUT + h * step, y: TOP + r * step })));
    return out;
  });
</script>

<div class="wrap" bind:clientWidth={cw}>
  <svg width={GUT + 24 * step} height={TOP + 7 * step} style="display:block">
    {#each [0, 6, 12, 18, 23] as h (h)}
      <text x={GUT + h * step} y={10}>{String(h).padStart(2, '0')}</text>
    {/each}
    {#each DAYS as d, r (d)}
      <text x={0} y={TOP + r * step + cell - 2}>{d}</text>
    {/each}
    {#each cells as c (c.k)}
      <rect x={c.x} y={c.y} width={cell} height={cell} fill={c.v > 0 ? 'var(--commit)' : 'var(--panel2)'} opacity={c.v > 0 ? o(c.v) : 1}>
        <title>{DAYS[c.r]} {String(c.h).padStart(2, '0')}:00  {c.v} commits</title>
      </rect>
    {/each}
  </svg>
</div>

<style>
  .wrap { width: 100%; overflow-x: auto; }
</style>
