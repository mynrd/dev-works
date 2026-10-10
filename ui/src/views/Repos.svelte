<script>
  import { app } from '../lib/state.svelte.js';
  import { loadBranches, saveSettings } from '../lib/actions.js';
  import MultiPick from '../components/MultiPick.svelte';

  const repos = $derived([...app.catalog.repos].sort((a, b) => a.name.localeCompare(b.name)));
  const overridden = $derived(repos.filter((r) => app.settings.branches[r.id]?.length).length);

  let saving = $state(false);
  let saved = $state(false);

  async function save() {
    saving = true;
    saved = false;
    saved = await saveSettings();
    saving = false;
    if (saved) setTimeout(() => (saved = false), 1500);
  }

  const strip = (ref) => (ref ? ref.replace(/^refs\/heads\//, '') : '-');

  function pick(id, keys) {
    if (keys.length) app.settings.branches[id] = keys;
    else delete app.settings.branches[id];
  }

  function emptyText(id) {
    if (app.loading.branches[id]) return 'loading...';
    return app.catalog.branches[id] ? 'no branches' : 'click to load';
  }
</script>

<div class="head">
  <span class="lbl">{repos.length} repos · {overridden} overridden</span>
  <span class="right">
    {#if saved}<span class="lbl dim">saved</span>{/if}
    <button type="button" onclick={save} disabled={saving || !app.settings.org}>Save</button>
  </span>
</div>

{#if !app.settings.org}
  <div class="empty">Enter org URL</div>
{:else if !app.settings.project}
  <div class="empty">Pick a project</div>
{:else if !repos.length}
  <div class="empty">{app.loading.repos ? 'loading repos' : 'no repos'}</div>
{:else}
  <table>
    <thead>
      <tr><th>repo</th><th>default</th><th>read</th><th></th></tr>
    </thead>
    <tbody>
      {#each repos as r (r.id)}
        {@const sel = app.settings.branches[r.id] ?? []}
        <tr class:over={sel.length}>
          <td class="name"><a href={r.webUrl} target="_blank" rel="noreferrer">{r.name}</a></td>
          <td class="num dim">{strip(r.defaultBranch)}</td>
          <td class="read">
            <div onfocusin={() => loadBranches(r.id)} onmousedown={() => loadBranches(r.id)} role="presentation">
              <MultiPick
                items={(app.catalog.branches[r.id] ?? []).map((name) => ({ id: name, name }))}
                selected={sel}
                placeholder={sel.length ? 'search branches' : 'default'}
                empty={emptyText(r.id)}
                onchange={(keys) => pick(r.id, keys)}
              />
            </div>
          </td>
          <td class="act">
            {#if sel.length}
              <button type="button" class="ghost" onclick={() => pick(r.id, [])} title="read the default branch again">reset</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
  .head .right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  td.name { border-left: 2px solid transparent; white-space: nowrap; }
  tr.over td { background: var(--panel2); }
  tr.over td.name { border-left-color: var(--text); }
  td.num { text-align: left; font-size: 12px; white-space: nowrap; }
  td.read { width: 50%; min-width: 260px; }
  td.act { width: 1%; white-space: nowrap; }
</style>
