<script>
  // Tiny line for Compare rows.
  import { scaleLinear } from 'd3-scale';
  import { line as d3line, curveMonotoneX } from 'd3-shape';

  let { data = [], width = 120, height = 22, color = 'var(--text)' } = $props();

  const x = $derived(scaleLinear().domain([0, Math.max(1, data.length - 1)]).range([1, width - 1]));
  const y = $derived(scaleLinear().domain([0, Math.max(1, ...data)]).range([height - 1, 1]));
  const d = $derived(d3line().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(data) || '');
</script>

<svg {width} {height} style="display:block">
  <line x1={1} x2={width - 1} y1={height - 1} y2={height - 1} stroke="var(--line)" />
  <path {d} fill="none" stroke={color} stroke-width={1.2} />
</svg>
