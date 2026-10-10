<script>
  // Presets + from/to date inputs. onpreset(id), onchange({ from, to }).
  import { PRESETS } from '../lib/dates.js';

  let { preset = '12m', from = '', to = '', onpreset, onchange } = $props();

  function setFrom(e) { onchange({ from: e.target.value, to }); }
  function setTo(e) { onchange({ from, to: e.target.value }); }
</script>

<div class="rp">
  <span class="lbl">range</span>
  <span class="seg">
    {#each PRESETS as p (p.id)}
      <button type="button" class:on={preset === p.id} onclick={() => onpreset(p.id)}>{p.label}</button>
    {/each}
  </span>
  <input type="date" value={from} onchange={setFrom} />
  <span class="lbl">to</span>
  <input type="date" value={to} onchange={setTo} />
</div>

<style>
  .rp { display: flex; align-items: center; gap: 8px; }
  input[type="date"] { width: 132px; }
</style>
