<script lang="ts">
	// One night, as a venue describes it: what it's called, how often, when, what
	// it costs. Shared by the discovery call and by "write up a night out" for a
	// venue with nothing on file. Posts n_* fields, each exactly once per block,
	// so several blocks on one form stay aligned (parsed by nights.ts) — and its
	// offers as n_perk_* rows with a per-block count, sliced back the same way.
	import { DAYS } from '#lib/build/add.js';
	import PerksEditor from './PerksEditor.svelte';

	let {
		categories,
		recurrences,
		recurrence = $bindable('WEEKLY'),
		dateMin = undefined,
		dateMax = undefined,
		registerDefault = 'as Q6', // the label for "no override"; '' means a register must be picked
		registerRequired = false,
		today,
		confirmOffers = false //    on a call, the offers are heard — so confirmed
	}: {
		categories: string[];
		recurrences: readonly { key: string; label: string }[];
		recurrence?: string;
		dateMin?: string;
		dateMax?: string;
		registerDefault?: string;
		registerRequired?: boolean;
		today: string;
		confirmOffers?: boolean;
	} = $props();

	const LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
	const standing = $derived(recurrence !== 'ONE_OFF');
</script>

<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_150px]">
	<label class="field"><span>Event name</span><input name="n_name" class="input h-11" placeholder="Acoustic Thursdays" /></label>
	<label class="field"><span>Category</span>
		<select name="n_category" class="input h-11">
			<option value="">—</option>
			{#each categories as c (c)}<option value={c}>{c.replaceAll('_', ' ').toLowerCase()}</option>{/each}
		</select>
	</label>
	<label class="field"><span>How often</span>
		<select name="n_recurrence" class="input h-11" bind:value={recurrence}>
			{#each recurrences as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
		</select>
	</label>
</div>
<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	{#if standing}
		<label class="field"><span>Day</span>
			<select name="n_day" class="input h-11">
				<option value="">—</option>
				{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAYS[d]}</option>{/each}
			</select>
		</label>
		<input type="hidden" name="n_date" value="" />
	{:else}
		<label class="field"><span>Date</span><input name="n_date" type="date" min={dateMin} max={dateMax} class="input h-11" /></label>
		<input type="hidden" name="n_day" value="" />
	{/if}
	<label class="field"><span>Starts <span class="text-energy">*</span></span><input name="n_start" class="input h-11 font-mono" placeholder="21:00" /></label>
	<label class="field"><span>Ends</span><input name="n_end" class="input h-11 font-mono" placeholder="02:00" /></label>
	<label class="field"><span>Register{#if registerRequired} <span class="text-energy">*</span>{/if}</span>
		<select name="n_register" class="input h-11" required={registerRequired}>
			<option value="">{registerRequired ? '—' : registerDefault}</option>
			{#each Object.keys(LABEL) as r (r)}<option value={r}>{LABEL[r]}</option>{/each}
		</select>
	</label>
</div>
<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	<label class="field"><span>Gate price</span><input name="n_gate" class="input h-11 font-mono" inputmode="numeric" placeholder="0 = free" /></label>
	<label class="field"><span>Advance price</span><input name="n_advance" class="input h-11 font-mono" inputmode="numeric" placeholder="—" /></label>
	{#if standing}
		<label class="field col-span-2"><span>Running since</span><input name="n_since" type="month" class="input h-11" /></label>
	{:else}
		<input type="hidden" name="n_since" value="" />
	{/if}
	<label class="field col-span-2 sm:col-span-4"><span>Lineup</span><input name="n_lineup" class="input h-11" placeholder="The Clan Band, DJ Smallz" /></label>
</div>
<div class="space-y-2">
	<p class="text-sm">“And is there anything that comes with it — drinks deals, food, free entry before a certain time?”</p>
	<!-- Weekly or one-off follows the night: a standing night's offers are every week, a one-off's are that date's. -->
	<PerksEditor prefix="n_perk" {today} confirm={confirmOffers} />
</div>
<p class="text-[11px] text-dim">
	{standing ? 'Saved as a standing night — it appears every week without being typed again.' : 'Saved as a dated one-off.'}
</p>
