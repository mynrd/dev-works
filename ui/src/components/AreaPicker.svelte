<script>
  // Collapsible area tree. tree: AreaNode { path, name, children }. onselect(path).
  import { untrack } from 'svelte';

  let { tree = null, value = '', onselect } = $props();

  let open = $state(false);
  let root = $state(null);
  let expanded = $state(new Set());

  // expand root and every ancestor of the current value
  $effect(() => {
    if (!tree) return;
    const next = new Set();
    const walk = (n, ancestors) => {
      if (n.path === value) ancestors.forEach((p) => next.add(p));
      next.add(tree.path);
      (n.children || []).forEach((c) => walk(c, [...ancestors, n.path]));
    };
    walk(tree, []);
    const cur = untrack(() => expanded);
    expanded = new Set([...cur, ...next]);
  });

  function toggle(path) {
    const s = new Set(expanded);
    if (s.has(path)) s.delete(path); else s.add(path);
    expanded = s;
  }

  function pick(path) {
    onselect(path);
    open = false;
  }

  $effect(() => {
    if (!open) return;
    const h = (e) => { if (root && !root.contains(e.target)) open = false; };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });

  const shown = $derived(value ? value.split('\\').slice(-2).join(' \\ ') : 'pick area');
</script>

{#snippet node(n, depth)}
  {@const kids = n.children || []}
  <div class="n" style={`padding-left:${depth * 14}px`}>
    {#if kids.length}
      <button type="button" class="tw ghost" onclick={() => toggle(n.path)}>{expanded.has(n.path) ? '-' : '+'}</button>
    {:else}
      <span class="tw"></span>
    {/if}
    <button type="button" class="name ghost" class:on={n.path === value} onclick={() => pick(n.path)} title={n.path}>{n.name}</button>
  </div>
  {#if kids.length && expanded.has(n.path)}
    {#each kids as c (c.path)}
      {@render node(c, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div class="ap" bind:this={root}>
  <button type="button" class="val" class:on={open} onclick={() => (open = !open)} title={value} disabled={!tree}>
    {tree ? shown : 'no areas'}
  </button>
  {#if open && tree}
    <div class="pop">
      {@render node(tree, 0)}
    </div>
  {/if}
</div>

<style>
  .ap { position: relative; }
  .val { text-transform: none; letter-spacing: 0; font-size: 12px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop {
    position: absolute; z-index: 20; top: 100%; left: 0; min-width: 320px; max-height: 360px; overflow: auto;
    background: var(--panel); border: 1px solid var(--line2); margin-top: -1px; padding: 4px 0;
  }
  .n { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
  .tw { width: 18px; padding: 0; text-align: center; font-size: 11px; color: var(--muted); display: inline-block; }
  .name { text-transform: none; letter-spacing: 0; font-size: 12px; padding: 2px 6px; color: var(--muted); }
  .name:hover { color: var(--text); }
  .name.on { color: var(--text); border-color: var(--line2); background: var(--panel2); }
</style>
