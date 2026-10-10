<script>
  // Searchable multi-select with chips. items: any[]; selected: key[]; onchange(keys).
  let {
    items = [],
    selected = [],
    onchange,
    keyOf = (x) => x.id,
    labelOf = (x) => x.name,
    accentOf = null,
    placeholder = 'search',
    empty = 'nothing to pick'
  } = $props();

  let q = $state('');
  let open = $state(false);
  let root = $state(null);

  const byKey = $derived(new Map(items.map((x) => [keyOf(x), x])));
  const chips = $derived(selected.map((k) => ({ k, label: byKey.has(k) ? labelOf(byKey.get(k)) : k })));
  const filtered = $derived.by(() => {
    const s = q.trim().toLowerCase();
    const list = s ? items.filter((x) => labelOf(x).toLowerCase().includes(s) || String(keyOf(x)).toLowerCase().includes(s)) : items;
    return list.slice(0, 80);
  });

  function toggle(k) {
    const set = new Set(selected);
    if (set.has(k)) set.delete(k); else set.add(k);
    onchange([...set]);
  }
  function remove(k) {
    onchange(selected.filter((x) => x !== k));
  }
  function all() { onchange(filtered.map(keyOf)); }
  function none() { onchange([]); }

  $effect(() => {
    if (!open) return;
    const h = (e) => { if (root && !root.contains(e.target)) open = false; };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });
</script>

<div class="mp" bind:this={root}>
  <div class="field" onclick={() => (open = true)} role="presentation">
    {#each chips as c (c.k)}
      <span class="chip">
        {#if accentOf}<i style={`background:${accentOf(c.k)}`}></i>{/if}
        {c.label}
        <button class="x" type="button" onclick={(e) => { e.stopPropagation(); remove(c.k); }} title="remove">x</button>
      </span>
    {/each}
    <input
      type="text"
      bind:value={q}
      {placeholder}
      onfocus={() => (open = true)}
      onkeydown={(e) => { if (e.key === 'Escape') open = false; if (e.key === 'Enter' && filtered.length === 1) toggle(keyOf(filtered[0])); }}
    />
  </div>
  {#if open}
    <div class="pop">
      <div class="tools">
        <button type="button" class="ghost" onclick={all}>all shown</button>
        <button type="button" class="ghost" onclick={none}>none</button>
        <span class="lbl">{selected.length} / {items.length}</span>
      </div>
      {#if !items.length}
        <div class="none lbl">{empty}</div>
      {/if}
      {#each filtered as it (keyOf(it))}
        {@const k = keyOf(it)}
        <div class="row" class:on={selected.includes(k)} onclick={() => toggle(k)} onkeydown={(e) => e.key === 'Enter' && toggle(k)} role="option" aria-selected={selected.includes(k)} tabindex="-1">
          <span class="box">{selected.includes(k) ? 'x' : ''}</span>
          {#if accentOf && selected.includes(k)}<i style={`background:${accentOf(k)}`}></i>{/if}
          <span class="name">{labelOf(it)}</span>
          {#if String(k) !== labelOf(it)}<span class="key">{k}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mp { position: relative; min-width: 180px; }
  .field {
    display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
    border: 1px solid var(--line2); background: var(--panel); padding: 2px 4px; min-height: 26px; cursor: text;
  }
  .field input { border: 0; background: transparent; flex: 1; min-width: 80px; padding: 2px 4px; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--mono); font-size: 11px; padding: 1px 2px 1px 6px;
    border: 1px solid var(--line2); background: var(--panel2); white-space: nowrap;
  }
  .chip i, .row i { display: inline-block; width: 8px; height: 8px; }
  .chip .x { border: 0; padding: 0 5px; font-size: 10px; background: transparent; color: var(--muted); }
  .chip .x:hover { color: var(--text); }
  .pop {
    position: absolute; z-index: 20; top: 100%; left: 0; min-width: 100%; max-height: 320px; overflow: auto;
    background: var(--panel); border: 1px solid var(--line2); margin-top: -1px;
  }
  .tools { display: flex; align-items: center; gap: 4px; padding: 4px; border-bottom: 1px solid var(--line); }
  .tools .lbl { margin-left: auto; padding-right: 6px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; font-family: var(--mono); font-size: 12px; white-space: nowrap; }
  .row:hover { background: var(--panel2); }
  .row.on .name { color: var(--text); }
  .row .name { color: var(--muted); }
  .row .key { color: var(--dim); font-size: 11px; margin-left: auto; padding-left: 12px; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--line2); font-size: 9px; line-height: 10px; text-align: center; color: var(--text); }
  .none { padding: 10px; }
</style>
