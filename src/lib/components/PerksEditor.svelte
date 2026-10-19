<script lang="ts" module>
	export type EditablePerk = {
		id: string | null;
		kind: string;
		label: string;
		condition: string | null;
		activeUntil: string | null; // YYYY-MM-DD
	};
</script>

<script lang="ts">
	// The offers on one night, edited inside a larger form; posted as parallel
	// lists and saved with the rest of it (see lib/server/perks.ts).

	let {
		perks = [],
		today,
		staleness = null
	}: { perks?: EditablePerk[]; today: string; staleness?: string | null } = $props();

	// svelte-ignore state_referenced_locally — seeds the editor once; the parent re-keys it per night.
	let rows = $state(perks.map((p) => ({ ...p, condition: p.condition ?? '', activeUntil: p.activeUntil ?? '' })));

	const KINDS = ['DRINK', 'FOOD', 'ENTRY', 'OTHER'];
	const add = () => rows.push({ id: null, kind: 'DRINK', label: '', condition: '', activeUntil: '' });
</script>

<div class="space-y-2">
	<input type="hidden" name="perks_sent" value="1" />
	{#if staleness && rows.some((r) => !r.activeUntil)}
		<p class="text-xs text-social">{staleness}</p>
	{/if}
	{#each rows as row, i (i)}
		{@const ended = row.activeUntil && row.activeUntil < today}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_150px_44px] {ended ? 'opacity-60' : ''}">
			<input type="hidden" name="perk_id" value={row.id ?? ''} />
			<select name="perk_kind" class="input h-11" bind:value={row.kind} aria-label="Kind of offer">
				{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
			</select>
			<input name="perk_label" class="input h-11" placeholder="Half-price cocktails" bind:value={row.label} aria-label="Offer" />
			<input name="perk_condition" class="input h-11" placeholder="before 9pm" bind:value={row.condition} aria-label="Condition" />
			<input name="perk_until" type="date" class="input h-11" bind:value={row.activeUntil} aria-label="Last day it holds" title="Last day it holds — empty means until told otherwise" />
			<button type="button" class="h-11 rounded-md border border-line text-dim hover:border-energy hover:text-energy" onclick={() => rows.splice(i, 1)} aria-label="Remove this offer">×</button>
			{#if ended}<p class="col-span-2 -mt-1 text-[11px] text-energy sm:col-span-5">Ended — it won’t show on any week. Remove it or give it a new end date.</p>{/if}
		</div>
	{/each}
	<button type="button" class="h-11 rounded-md border border-dashed border-line px-3 text-sm text-dim hover:border-dim" onclick={add}>+ Add an offer</button>
	<p class="text-[11px] text-dim">End date is the last day it holds; leave it empty only if it runs until they say otherwise. A stale offer turns a reader away at the door.</p>
</div>
