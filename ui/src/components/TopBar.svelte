<script>
  import { app, accent } from '../lib/state.svelte.js';
  import { loadProjects, loadCatalog, onProjectChange, onTeamChange, applyPreset, run } from '../lib/actions.js';
  import MultiPick from './MultiPick.svelte';
  import AreaPicker from './AreaPicker.svelte';
  import RangePicker from './RangePicker.svelte';
  import Progress from './Progress.svelte';

  const GRAN = ['day', 'week', 'month', 'year'];

  async function onOrg() {
    const org = app.settings.org.trim().replace(/\/+$/, '');
    app.settings.org = org;
    if (!org || org === app.loadedOrg) return;
    app.settings.project = '';
    app.catalog.projects = [];
    await loadProjects();
    if (app.catalog.projects.length === 1) {
      app.settings.project = app.catalog.projects[0].name;
      await onProjectChange();
    }
  }

  const repoScope = $derived(app.settings.scope === 'all' ? [] : app.settings.scope);
  const busy = $derived(app.running);
</script>

<div class="bar">
  <div class="row">
    <span class="lbl">org</span>
    <input
      class="org"
      type="text"
      placeholder="https://dev.azure.com/<org>"
      bind:value={app.settings.org}
      onblur={onOrg}
      onkeydown={(e) => e.key === 'Enter' && onOrg()}
    />
    <span class="lbl">project</span>
    <select bind:value={app.settings.project} onchange={onProjectChange} disabled={!app.catalog.projects.length}>
      <option value="">{app.loading.projects ? 'loading' : app.catalog.projects.length ? 'pick' : '-'}</option>
      {#each app.catalog.projects as p (p.id)}
        <option value={p.name}>{p.name}</option>
      {/each}
    </select>
    <span class="lbl">team</span>
    <select bind:value={app.settings.teamId} onchange={onTeamChange} disabled={!app.catalog.teams.length}>
      <option value="">{app.loading.teams ? 'loading' : '-'}</option>
      {#each app.catalog.teams as t (t.id)}
        <option value={t.id}>{t.name}</option>
      {/each}
    </select>
    <span class="lbl">members</span>
    <div class="grow">
      <MultiPick
        items={app.catalog.members}
        selected={app.settings.members}
        keyOf={(m) => m.email}
        labelOf={(m) => m.name}
        accentOf={accent}
        placeholder={app.loading.members ? 'loading' : 'search members'}
        empty="pick a team first"
        onchange={(v) => (app.settings.members = v)}
      />
    </div>
    <button type="button" class="primary" onclick={() => run()} disabled={busy}>Run</button>
    <button type="button" onclick={() => run({ force: true })} disabled={busy} title="bypass cache">Refresh</button>
  </div>

  <div class="row">
    <RangePicker
      preset={app.settings.preset}
      from={app.settings.from}
      to={app.settings.to}
      onpreset={applyPreset}
      onchange={({ from, to }) => { app.settings.from = from; app.settings.to = to; app.settings.preset = 'custom'; }}
    />
    <span class="sep"></span>
    <span class="lbl">scope</span>
    <span class="seg">
      <button type="button" class:on={app.settings.scope === 'all'} onclick={() => (app.settings.scope = 'all')}>All repos</button>
      <button type="button" class:on={app.settings.scope !== 'all'} onclick={() => { if (app.settings.scope === 'all') app.settings.scope = []; }}>Pick repos</button>
    </span>
    {#if app.settings.scope !== 'all'}
      <div class="repos">
        <MultiPick
          items={app.catalog.repos}
          selected={repoScope}
          keyOf={(r) => r.id}
          labelOf={(r) => r.name}
          placeholder={app.loading.repos ? 'loading' : 'search repos'}
          empty="no repos loaded"
          onchange={(v) => (app.settings.scope = v)}
        />
      </div>
    {/if}
    <span class="sep"></span>
    <span class="lbl">area</span>
    <AreaPicker tree={app.catalog.areas} value={app.settings.areaPath} onselect={(p) => (app.settings.areaPath = p)} />
    <span class="sep"></span>
    <span class="lbl">by</span>
    <span class="seg">
      {#each GRAN as g (g)}
        <button type="button" class:on={app.settings.granularity === g} onclick={() => (app.settings.granularity = g)}>{g}</button>
      {/each}
    </span>
    <span class="spacer"></span>
    {#if app.activity}
      <span class="lbl stat" title={app.activity.warnings.join('\n')}>
        {app.activity.repos.length} repos · {app.activity.commits.length} commits · {app.activity.prs.length} prs · {app.activity.workItems.length} items
        {#if app.activity.warnings.length} · {app.activity.warnings.length} warnings{/if}
      </span>
    {/if}
  </div>

  {#if app.job}
    <Progress job={app.job} />
  {/if}
  {#if app.error}
    <div class="err">{app.error}</div>
  {/if}
</div>

<style>
  .bar { border-bottom: 1px solid var(--line); padding: 8px 16px 8px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .org { width: 300px; }
  .grow { flex: 1; min-width: 220px; }
  .repos { min-width: 240px; flex: 1; }
  select { max-width: 200px; }
  .sep { width: 1px; height: 18px; background: var(--line2); }
  .spacer { flex: 1; }
  .stat { color: var(--dim); white-space: nowrap; }
  .err { padding-top: 2px; }
</style>
