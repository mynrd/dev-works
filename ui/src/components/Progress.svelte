<script>
  // Job progress: stage name and done/total.
  let { job = null } = $props();
  const pct = $derived(job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : null);
</script>

{#if job}
  <div class="pg">
    <div class="meta lbl">
      <span>{job.stage || 'running'}</span>
      <span class="num">{job.total > 0 ? `${job.done} / ${job.total}` : '...'}</span>
    </div>
    <div class="bar">
      {#if pct != null}
        <div class="fill" style={`width:${pct}%`}></div>
      {:else}
        <div class="fill pulse"></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pg { padding: 4px 0 0; }
  .meta { display: flex; justify-content: space-between; padding-bottom: 3px; }
  .bar { height: 2px; background: var(--line); position: relative; overflow: hidden; }
  .fill { height: 2px; background: var(--text); transition: width 0.2s linear; }
  .pulse { width: 30%; animation: slide 1.2s linear infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(400%); } }
</style>
