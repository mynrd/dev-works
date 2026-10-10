<script>
  // GitHub-shaped calendar: columns = weeks (Mon..Sun rows), one cell per day.
  // Each cell is split diagonally: top-left = commits (--commit), bottom-right = work items (--wi).
  import { scaleSqrt } from 'd3-scale';
  import { mondayOf, addDays, ymd, monthShort, parseYmd } from '../lib/dates.js';

  let { data = new Map(), from, to, selected = null, onselect = null, width = 0 } = $props();

  let cw = $state(0);
  const w = $derived(width || cw || 600);

  const GUT = 30, TOP = 16, GAP = 2;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const start = $derived(mondayOf(from));
  const totalDays = $derived(Math.max(1, Math.round((parseYmd(to) - start) / 86400000) + 1));
  const weeks = $derived(Math.max(1, Math.ceil(totalDays / 7)));
  const cell = $derived(Math.max(8, Math.min(16, Math.floor((w - GUT) / weeks) - GAP)));
  const step = $derived(cell + GAP);
  const svgW = $derived(GUT + weeks * step);
  const svgH = $derived(TOP + 7 * step);

  const maxC = $derived(Math.max(1, ...[...data.values()].map((r) => r.commits)));
  const maxI = $derived(Math.max(1, ...[...data.values()].map((r) => r.items)));
  const oc = $derived(scaleSqrt().domain([0, maxC]).range([0.3, 1]));
  const oi = $derived(scaleSqrt().domain([0, maxI]).range([0.3, 1]));

  const cells = $derived.by(() => {
    const out = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const k = ymd(d);
      const col = Math.floor(i / 7), row = i % 7;
      const r = data.get(k) || { commits: 0, prs: 0, items: 0 };
      out.push({ k, x: GUT + col * step, y: TOP + row * step, r, inRange: k >= from && k <= to });
    }
    return out;
  });

  const months = $derived.by(() => {
    const out = [];
    let lastX = -100;
    for (let col = 0; col < weeks; col++) {
      const mon = addDays(start, col * 7);
      const sun = addDays(mon, 6);
      const prev = addDays(mon, -1);
      const isNew = col === 0 || sun.getMonth() !== prev.getMonth();
      if (!isNew) continue;
      const x = GUT + col * step;
      if (x - lastX < 28) continue;
      out.push({ x, label: monthShort(col === 0 ? mon : sun) });
      lastX = x;
    }
    return out;
  });

  const title = (c) => `${c.k}  ${c.r.commits} commits  ${c.r.prs} PR events  ${c.r.items} item events`;
</script>

<div class="wrap" bind:clientWidth={cw}>
  <svg width={svgW} height={svgH} style="display:block">
    {#each months as m (m.x)}
      <text x={m.x} y={10}>{m.label}</text>
    {/each}
    {#each [0, 2, 4, 6] as row (row)}
      <text x={0} y={TOP + row * step + cell - 2}>{DAYS[row]}</text>
    {/each}
    {#each cells as c (c.k)}
      <g
        class="cell"
        class:dead={!c.inRange}
        class:sel={selected === c.k}
        onclick={() => c.inRange && onselect && onselect(c.k)}
        role={c.inRange && onselect ? 'button' : undefined}
      >
        <title>{title(c)}</title>
        <rect x={c.x} y={c.y} width={cell} height={cell} fill={c.inRange ? 'var(--panel2)' : 'var(--panel)'} />
        {#if c.inRange && c.r.commits > 0}
          <polygon points={`${c.x},${c.y} ${c.x + cell},${c.y} ${c.x},${c.y + cell}`} fill="var(--commit)" opacity={oc(c.r.commits)} />
        {/if}
        {#if c.inRange && c.r.items > 0}
          <polygon points={`${c.x + cell},${c.y} ${c.x + cell},${c.y + cell} ${c.x},${c.y + cell}`} fill="var(--wi)" opacity={oi(c.r.items)} />
        {/if}
        {#if selected === c.k}
          <rect x={c.x + 0.5} y={c.y + 0.5} width={cell - 1} height={cell - 1} fill="none" stroke="var(--text)" />
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .wrap { width: 100%; overflow-x: auto; }
  .cell { cursor: pointer; }
  .cell.dead { cursor: default; }
  .cell:hover rect:first-of-type { stroke: var(--muted); }
</style>
