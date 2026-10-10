<script>
  import { untrack } from 'svelte';
  import { app, accent, memberName } from '../lib/state.svelte.js';
  import { runDigest, digestWindow } from '../lib/actions.js';
  import { dayEvents, standupText } from '../lib/metrics.js';
  import { ymd, hm, addDays, startOfLocalDay, endOfLocalDay } from '../lib/dates.js';
  import Progress from '../components/Progress.svelte';

  const d = $derived(app.digest);
  const members = $derived(app.settings.members);
  const win = $derived(digestWindow());
  const label = $derived(win.from === win.to ? win.from : `${win.from} to ${win.to}`);

  let copied = $state(false);

  function shift(n) {
    app.digest.anchor = ymd(addDays(app.digest.anchor, app.digest.mode === 'week' ? 7 * n : n));
  }
  function setMode(m) { app.digest.mode = m; }
  function setAnchor(e) { if (e.target.value) app.digest.anchor = e.target.value; }

  // fetch the window (with updates) whenever it changes or a main Run finishes
  $effect(() => {
    const w = digestWindow();
    const seq = app.runSeq;
    const ready = seq > 0 && app.settings.org && app.settings.project && app.settings.areaPath;
    if (!ready) return;
    void w;
    untrack(() => runDigest({ force: app.lastForce }));
  });

  const perMember = $derived.by(() => {
    if (!d.activity || !d.range) return [];
    const fromISO = startOfLocalDay(d.range.from).toISOString();
    const toISO = endOfLocalDay(d.range.to).toISOString();
    return members.map((email) => ({ email, name: memberName(email), events: dayEvents(d.activity, email, fromISO, toISO) }));
  });

  const hasApprox = $derived(perMember.some((m) => m.events.some((e) => e.approx)));
  const multiDay = $derived(win.from !== win.to);

  async function copy() {
    const text = perMember.map((m) => standupText(m.email, m.events, label)).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      app.digest.error = `clipboard: ${e.message}`;
    }
  }

  const KIND_COLOR = { C: 'var(--commit)', PR: 'var(--pr)', WI: 'var(--wi)' };
</script>

<div class="head">
  <span class="seg">
    <button type="button" class:on={d.mode === 'day'} onclick={() => setMode('day')}>Day</button>
    <button type="button" class:on={d.mode === 'week'} onclick={() => setMode('week')}>Week</button>
  </span>
  <span class="seg">
    <button type="button" onclick={() => shift(-1)} title="previous">&lt;</button>
    <button type="button" onclick={() => shift(1)} title="next">&gt;</button>
  </span>
  <input type="date" value={d.anchor} onchange={setAnchor} />
  <span class="lbl">{label}</span>
  <button type="button" class="ghost" onclick={() => (app.digest.anchor = ymd(addDays(new Date(), -1)))}>yesterday</button>
  <span class="right"></span>
  {#if d.running}<span class="lbl">fetching</span>{/if}
  <button type="button" onclick={copy} disabled={!perMember.length}>{copied ? 'copied' : 'Copy as standup'}</button>
</div>

{#if d.job}
  <Progress job={d.job} />
{/if}
{#if d.error}
  <div class="err">{d.error}</div>
{/if}

{#if !app.settings.org}
  <div class="empty">Enter org URL</div>
{:else if !members.length}
  <div class="empty">Pick members</div>
{:else if app.runSeq === 0}
  <div class="empty">Run</div>
{:else if !d.activity}
  <div class="empty">{d.running ? 'fetching digest window' : 'no digest data'}</div>
{:else}
  {#if hasApprox}
    <div class="lbl note">~ before a time means the vote time is unknown; the PR's closed (or created) date is shown instead.</div>
  {/if}
  <div class="grid">
    {#each perMember as m (m.email)}
      <div class="tl">
        <div class="th">
          <span class="sw" style={`background:${accent(m.email)}`}></span>
          <a href={`#/member/${encodeURIComponent(m.email)}`}>{m.name}</a>
          <span class="lbl right">{m.events.length} events</span>
        </div>
        {#if !m.events.length}
          <div class="mono dim none">no activity</div>
        {/if}
        {#each m.events as e, i (i)}
          {#if multiDay && (i === 0 || ymd(new Date(e.t)) !== ymd(new Date(m.events[i - 1].t)))}
            <div class="dayrule lbl">{ymd(new Date(e.t))}</div>
          {/if}
          <div class="ev">
            <span class="time mono">{e.approx ? '~' : ''}{hm(new Date(e.t))}</span>
            <span class="g" style={`color:${KIND_COLOR[e.kind]}`}>{e.kind}</span>
            <span class="body">
              {#if e.url}
                <a href={e.url} target="_blank" rel="noreferrer">{e.text}</a>
              {:else}
                <span>{e.text}</span>
              {/if}
              {#if e.detail}<span class="detail mono">{e.detail}</span>{/if}
            </span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; flex-wrap: wrap; }
  .right { margin-left: auto; }
  .note { padding: 6px 0 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 0 28px; }
  .tl { border-top: 1px solid var(--line2); padding-bottom: 18px; }
  .th { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .th a { color: var(--text); }
  .sw { display: inline-block; width: 8px; height: 8px; }
  .none { padding: 10px 0; }
  .dayrule { padding: 10px 0 2px; border-bottom: 1px solid var(--line); color: var(--text); }
  .ev { display: grid; grid-template-columns: 48px 24px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); align-items: baseline; }
  .time { color: var(--muted); font-size: 11px; }
  .g { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; }
  .body { display: flex; flex-direction: column; min-width: 0; }
  .body a { color: var(--text); }
  .body > span, .body > a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { color: var(--dim); font-size: 11px; }
</style>
