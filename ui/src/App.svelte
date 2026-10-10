<script>
  import { onMount } from 'svelte';
  import { app, accent, memberName, currentRange } from './lib/state.svelte.js';
  import { boot } from './lib/actions.js';
  import { memberCommits, itemsResolved } from './lib/metrics.js';
  import { fmt } from './lib/format.js';
  import TopBar from './components/TopBar.svelte';
  import Digest from './views/Digest.svelte';
  import Member from './views/Member.svelte';
  import Compare from './views/Compare.svelte';
  import Flow from './views/Flow.svelte';
  import Repos from './views/Repos.svelte';

  const VIEWS = [
    { id: 'digest', label: 'Digest', hint: 'what happened' },
    { id: 'member', label: 'Member', hint: 'one person' },
    { id: 'compare', label: 'Compare', hint: 'side by side' },
    { id: 'flow', label: 'Flow', hint: 'team items' },
    { id: 'repos', label: 'Repos', hint: 'which branch' }
  ];

  function parse() {
    const h = location.hash || '#/digest';
    const parts = h.replace(/^#\/?/, '').split('/');
    const view = VIEWS.some((v) => v.id === parts[0]) ? parts[0] : 'digest';
    let param = '';
    try { param = decodeURIComponent(parts.slice(1).join('/')); } catch { param = ''; }
    app.route = { view, param };
  }

  onMount(() => {
    parse();
    boot();
  });

  const tape = $derived.by(() => {
    const a = app.activity;
    const r = currentRange();
    return app.settings.members
      .map((email) => {
        const commits = a ? memberCommits(a, email, r).length : 0;
        const resolved = a ? itemsResolved(a, email, r).length : 0;
        return { email, name: memberName(email), commits, resolved, score: commits + resolved };
      })
      .sort((x, y) => y.score - x.score);
  });

  const href = (v) => (v.id === 'member' && app.settings.members.length ? `#/member/${encodeURIComponent(app.route.param || app.settings.members[0])}` : `#/${v.id}`);
</script>

<svelte:window onhashchange={parse} />

<div class="shell">
  <aside class="rail">
    <div class="brand">
      <div class="lbl brand-t">Dev Works</div>
      <div class="lbl dim">mission log</div>
    </div>
    <nav>
      {#each VIEWS as v (v.id)}
        <a class="nav" class:on={app.route.view === v.id} href={href(v)}>
          <span class="lbl">{v.label}</span>
          <span class="hint lbl dim">{v.hint}</span>
        </a>
      {/each}
    </nav>
    <div class="tape">
      <div class="lbl tape-h">members <span class="dim">commits + resolved</span></div>
      {#if !tape.length}
        <div class="lbl dim pad">{app.settings.org ? 'pick members' : 'enter org url'}</div>
      {/if}
      {#each tape as m, i (m.email)}
        <a class="mem" class:on={app.route.view === 'member' && app.route.param === m.email} href={`#/member/${encodeURIComponent(m.email)}`} title={m.email}>
          <span class="rank num dim">{i + 1}</span>
          <span class="sw" style={`background:${accent(m.email)}`}></span>
          <span class="name">{m.name}</span>
          <span class="score num">{app.activity ? fmt(m.score) : ''}</span>
        </a>
      {/each}
    </div>
    <div class="foot lbl dim">
      {#if app.activity}
        fetched {new Date(app.activity.fetchedAt).toLocaleTimeString()} · {fmt(app.activity.durationMs)} ms
      {:else}
        local only · read only
      {/if}
    </div>
  </aside>

  <main>
    <TopBar />
    <section class="content">
      {#if app.route.view === 'member'}
        <Member email={app.route.param} />
      {:else if app.route.view === 'compare'}
        <Compare />
      {:else if app.route.view === 'flow'}
        <Flow />
      {:else if app.route.view === 'repos'}
        <Repos />
      {:else}
        <Digest />
      {/if}
    </section>
  </main>
</div>

<style>
  .shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
  .rail { border-right: 1px solid var(--line); display: flex; flex-direction: column; background: var(--panel); position: sticky; top: 0; height: 100vh; }
  .brand { padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
  .brand-t { color: var(--text); font-size: 12px; }
  nav { display: flex; flex-direction: column; border-bottom: 1px solid var(--line); }
  .nav { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 14px; border-left: 2px solid transparent; text-decoration: none; }
  .nav:hover { text-decoration: none; background: var(--panel2); }
  .nav.on { border-left-color: var(--text); background: var(--panel2); }
  .nav.on .lbl:first-child { color: var(--text); }
  .hint { font-size: 10px; letter-spacing: 0.04em; text-transform: none; }
  .tape { flex: 1; overflow: auto; padding: 8px 0; }
  .tape-h { padding: 4px 14px 6px; }
  .tape-h .dim { font-size: 10px; margin-left: 4px; text-transform: none; letter-spacing: 0.02em; }
  .pad { padding: 6px 14px; }
  .mem { display: grid; grid-template-columns: 16px 8px 1fr auto; gap: 8px; align-items: center; padding: 5px 14px; color: var(--muted); font-size: 12px; text-decoration: none; border-left: 2px solid transparent; }
  .mem:hover { background: var(--panel2); text-decoration: none; color: var(--text); }
  .mem.on { color: var(--text); border-left-color: var(--text); background: var(--panel2); }
  .mem .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sw { display: inline-block; width: 8px; height: 8px; }
  .rank { font-size: 10px; }
  .score { font-size: 11px; }
  .foot { padding: 10px 14px; border-top: 1px solid var(--line); text-transform: none; letter-spacing: 0.02em; font-size: 10px; }
  main { min-width: 0; }
  .content { padding: 14px 16px 40px; }
</style>
