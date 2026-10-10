<script>
  import { app, accent, memberName, currentRange } from '../lib/state.svelte.js';
  import * as M from '../lib/metrics.js';
  import { fmt, fmt1, pct, days, hours } from '../lib/format.js';
  import { ymd, hm } from '../lib/dates.js';
  import HeatCalendar from '../charts/HeatCalendar.svelte';
  import StackedBars from '../charts/StackedBars.svelte';
  import RhythmGrid from '../charts/RhythmGrid.svelte';
  import DotStrip from '../charts/DotStrip.svelte';
  import HBars from '../charts/HBars.svelte';

  let { email = '' } = $props();

  const a = $derived(app.activity);
  const range = $derived(currentRange());
  const members = $derived(app.settings.members);
  const gran = $derived(app.settings.granularity);

  let selectedDay = $state(null);

  $effect(() => {
    if (!email && members.length) location.hash = '#/member/' + encodeURIComponent(members[0]);
  });

  function go(e) {
    location.hash = '#/member/' + encodeURIComponent(e.target.value);
  }

  const m = $derived.by(() => {
    if (!a || !email) return null;
    const cycle = M.cycleTimes(a, email, range);
    return {
      commits: M.memberCommits(a, email, range).length,
      prsCompleted: M.prsCompleted(a, email, range).length,
      itemsCreated: M.itemsCreated(a, email, range).length,
      itemsResolved: M.itemsResolved(a, email, range).length,
      itemsClosed: M.itemsClosed(a, email, range).length,
      points: M.pointsResolved(a, email, range),
      activeDays: M.activeDays(a, email, range).size,
      activeRatio: M.activeDaysRatio(a, email, range),
      idleGap: M.longestIdleGap(a, email, range),
      reviews: M.reviewsGiven(a, email, range).length,
      turnaround: M.prTurnaroundMedianHours(a, email, range),
      daily: M.dailySeries(a, email, range),
      buckets: M.bucketSeries(a, email, range, gran),
      rhythm: M.rhythm(a, email, range),
      cycle: cycle.map((c) => ({ id: c.item.id, date: c.resolved, days: c.days, title: `#${c.item.id} ${c.item.title}`, url: c.item.url })),
      cycleMedian: M.median(cycle.map((c) => c.days)),
      aging: M.agingOpenItems(a, email),
      repoMix: M.repoMix(a, email, range),
      typeSplit: M.typeSplit(a, email, range)
    };
  });

  const dayDetail = $derived.by(() => {
    if (!a || !email || !selectedDay) return null;
    const on = (iso) => iso && ymd(new Date(iso)) === selectedDay;
    const commits = a.commits.filter((c) => !c.isMerge && c.email === email && on(c.date)).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    const prs = [];
    for (const p of a.prs) {
      if (p.createdBy !== email) continue;
      if (on(p.created)) prs.push({ k: `c${p.id}`, t: p.created, what: 'opened', p });
      if (on(p.closed)) prs.push({ k: `x${p.id}`, t: p.closed, what: p.status, p });
    }
    const items = [];
    for (const w of a.workItems) {
      if (w.assignedTo !== email) continue;
      if (on(w.created)) items.push({ k: `c${w.id}`, what: 'created', w });
      if (on(w.resolved)) items.push({ k: `r${w.id}`, what: 'resolved', w });
      if (on(w.closed)) items.push({ k: `x${w.id}`, what: 'closed', w });
    }
    return { commits, prs, items };
  });

  const typeMax = $derived(m ? Math.max(1, ...m.typeSplit.map((t) => Math.max(t.created, t.resolved))) : 1);
</script>

<div class="head">
  <span class="lbl">member</span>
  <select value={email} onchange={go} disabled={!members.length}>
    {#if !members.length}<option value="">-</option>{/if}
    {#each members as e (e)}
      <option value={e}>{memberName(e)}</option>
    {/each}
  </select>
  {#if email}
    <span class="sw" style={`background:${accent(email)}`}></span>
    <span class="mono muted">{email}</span>
  {/if}
  <span class="lbl right">{range.from} to {range.to}</span>
</div>

{#if !app.settings.org}
  <div class="empty">Enter org URL</div>
{:else if !members.length}
  <div class="empty">Pick members</div>
{:else if !a}
  <div class="empty">Run</div>
{:else if m}
  <div class="totals">
    {#each [
      ['commits', fmt(m.commits)],
      ['prs completed', fmt(m.prsCompleted)],
      ['items created', fmt(m.itemsCreated)],
      ['resolved', fmt(m.itemsResolved)],
      ['closed', fmt(m.itemsClosed)],
      ['points resolved', fmt1(m.points)],
      ['active days', `${fmt(m.activeDays)}`],
      ['active ratio', pct(m.activeRatio)],
      ['longest idle', `${fmt(m.idleGap)} wd`],
      ['reviews', fmt(m.reviews)],
      ['pr turnaround', hours(m.turnaround)]
    ] as [l, v] (l)}
      <div class="t">
        <div class="big">{v}</div>
        <div class="lbl">{l}</div>
      </div>
    {/each}
  </div>

  <div class="sec"><span class="lbl">calendar</span><span class="lbl"><i class="k" style="background:var(--commit)"></i>commits <i class="k" style="background:var(--wi)"></i>work items · click a day</span></div>
  <HeatCalendar data={m.daily} from={range.from} to={range.to} selected={selectedDay} onselect={(d) => (selectedDay = selectedDay === d ? null : d)} />

  {#if selectedDay && dayDetail}
    <div class="day">
      <div class="dh">
        <span class="lbl">{selectedDay}</span>
        <span class="lbl mono">{dayDetail.commits.length} commits · {dayDetail.prs.length} pr events · {dayDetail.items.length} item events</span>
        <button type="button" class="ghost" onclick={() => (selectedDay = null)}>close</button>
      </div>
      {#if !dayDetail.commits.length && !dayDetail.prs.length && !dayDetail.items.length}
        <div class="muted mono">nothing on this day</div>
      {/if}
      {#each dayDetail.commits as c (c.id)}
        <div class="ln"><span class="mono dim">{hm(c.date)}</span><span class="g" style="color:var(--commit)">C</span><span class="mono muted">{c.repoName}</span><a href={c.url} target="_blank" rel="noreferrer">{c.message}</a><span class="mono dim">+{c.add} ~{c.edit} -{c.del}</span></div>
      {/each}
      {#each dayDetail.prs as x (x.k)}
        <div class="ln"><span class="mono dim">{hm(x.t)}</span><span class="g" style="color:var(--pr)">PR</span><span class="mono muted">{x.what}</span><a href={x.p.url} target="_blank" rel="noreferrer">#{x.p.id} {x.p.title}</a><span class="mono dim">{x.p.repoName}</span></div>
      {/each}
      {#each dayDetail.items as x (x.k)}
        <div class="ln"><span class="mono dim"></span><span class="g" style="color:var(--wi)">WI</span><span class="mono muted">{x.what}</span><a href={x.w.url} target="_blank" rel="noreferrer">#{x.w.id} {x.w.title}</a><span class="mono dim">{x.w.type} · {x.w.state}</span></div>
      {/each}
    </div>
  {/if}

  <div class="sec"><span class="lbl">activity by {gran}</span><span class="lbl"><i class="k" style="background:var(--commit)"></i>commits <i class="k" style="background:var(--pr)"></i>prs <i class="k" style="background:var(--wi)"></i>items</span></div>
  <StackedBars data={m.buckets} />

  <div class="cols">
    <div>
      <div class="sec"><span class="lbl">commit rhythm</span><span class="lbl">weekday x hour, local</span></div>
      <RhythmGrid data={m.rhythm} />
    </div>
    <div>
      <div class="sec"><span class="lbl">repo mix</span><span class="lbl">{m.repoMix.length} repos</span></div>
      {#if m.repoMix.length}
        <HBars data={m.repoMix} />
      {:else}
        <div class="muted mono">no commits in range</div>
      {/if}
    </div>
  </div>

  <div class="sec"><span class="lbl">cycle time</span><span class="lbl">{m.cycle.length} resolved · activated (or created) to resolved</span></div>
  {#if m.cycle.length}
    <DotStrip data={m.cycle} from={range.from} to={range.to} median={m.cycleMedian} />
  {:else}
    <div class="muted mono">no resolved items in range</div>
  {/if}

  <div class="cols">
    <div>
      <div class="sec"><span class="lbl">type split</span><span class="lbl">created vs resolved</span></div>
      {#if m.typeSplit.length}
        <table>
          <thead><tr><th>type</th><th class="num">created</th><th class="num">resolved</th><th></th></tr></thead>
          <tbody>
            {#each m.typeSplit as t (t.type)}
              <tr>
                <td>{t.type}</td>
                <td class="num">{fmt(t.created)}</td>
                <td class="num">{fmt(t.resolved)}</td>
                <td class="bars">
                  <div class="b" style={`width:${(t.created / typeMax) * 100}%;background:var(--pr)`}></div>
                  <div class="b" style={`width:${(t.resolved / typeMax) * 100}%;background:var(--wi)`}></div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="muted mono">no items in range</div>
      {/if}
    </div>
    <div>
      <div class="sec"><span class="lbl">aging open items</span><span class="lbl">{m.aging.length} open · oldest first</span></div>
      {#if m.aging.length}
        <table>
          <thead><tr><th class="num">age</th><th>id</th><th>title</th><th>state</th></tr></thead>
          <tbody>
            {#each m.aging.slice(0, 40) as x (x.item.id)}
              <tr>
                <td class="num">{days(x.ageDays)}</td>
                <td class="num"><a href={x.item.url} target="_blank" rel="noreferrer">#{x.item.id}</a></td>
                <td class="ttl" title={x.item.title}>{x.item.title}</td>
                <td class="mono muted">{x.item.state}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if m.aging.length > 40}<div class="lbl pad">+{m.aging.length - 40} more</div>{/if}
      {:else}
        <div class="muted mono">nothing open</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; }
  .head .right { margin-left: auto; }
  .sw { display: inline-block; width: 10px; height: 10px; }
  .totals { display: flex; flex-wrap: wrap; gap: 0 28px; padding: 8px 0 14px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .t { padding: 8px 0 0; min-width: 90px; }
  .k { display: inline-block; width: 8px; height: 8px; margin: 0 4px 0 8px; vertical-align: 0; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; }
  @media (max-width: 1200px) { .cols { grid-template-columns: 1fr; } }
  .day { margin-top: 12px; border-top: 1px solid var(--line2); border-bottom: 1px solid var(--line2); padding: 6px 0 8px; }
  .dh { display: flex; gap: 14px; align-items: center; padding-bottom: 4px; }
  .dh button { margin-left: auto; }
  .ln { display: grid; grid-template-columns: 44px 24px 120px 1fr auto; gap: 10px; padding: 2px 0; align-items: baseline; }
  .ln a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .g { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; }
  .bars { width: 40%; }
  .bars .b { height: 4px; margin: 1px 0; }
  .ttl { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pad { padding: 6px 8px; }
</style>
