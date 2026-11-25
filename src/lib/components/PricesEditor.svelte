<script lang="ts" module>
	export type EditablePrice = {
		id: string | null;
		label: string;
		amount: number | string;
		timing: string | null;
		availableUntil: string | null;
		perTable: boolean;
		seats: number | null;
	};
</script>

<script lang="ts">
	// A night's prices, edited inside a larger form and saved with it (see
	// lib/server/price.ts). One row by default — "Entry", at the gate — so the
	// one-price night (most of them) is exactly the old single field. "+ Add a
	// price" takes what gets volunteered: "20 ordinary, 50 VIP", a table for 8.
	// The label is the venue's own word, kept verbatim.
	//
	// `timing` offers gate/advance per row: asked of a dated night, not of a
	// standing one, where an advance price has never once been recorded.
	let {
		prices = [],
		prefix = 'price', //  field names: price_label … — another for a second editor on the form
		timing = false,
		today
	}: { prices?: EditablePrice[]; prefix?: string; timing?: boolean; today: string } = $props();

	type Row = { id: string | null; label: string; amount: string; timing: string; until: string; perTable: boolean; seats: string; more: boolean };
	const blank = (): Row => ({ id: null, label: 'Entry', amount: '', timing: 'GATE', until: '', perTable: false, seats: '', more: false });
	// svelte-ignore state_referenced_locally — seeds the editor once; the page reloads per night.
	let rows = $state<Row[]>(
		prices.length
			? prices.map((p) => ({
					id: p.id,
					label: p.label,
					amount: String(p.amount),
					timing: p.timing ?? '',
					until: p.availableUntil ?? '',
					perTable: p.perTable,
					seats: p.seats == null ? '' : String(p.seats),
					more: p.perTable || !!p.availableUntil
				}))
			: [blank()]
	);
	const add = () => rows.push({ ...blank(), label: '', timing: timing ? '' : 'GATE', more: true });
</script>

<div class="space-y-2">
	<input type="hidden" name="{prefix}s_sent" value="1" />
	<input type="hidden" name="{prefix}_count" value={rows.length} />
	{#each rows as row, i (i)}
		<div class="space-y-1.5 rounded-md border border-line bg-ink/40 p-2">
			<input type="hidden" name="{prefix}_id" value={row.id ?? ''} />
			<input type="hidden" name="{prefix}_table" value={row.perTable ? '1' : ''} />
			<div class="grid grid-cols-[minmax(0,1fr)_110px_auto] items-center gap-2 {timing ? 'sm:grid-cols-[minmax(0,1fr)_110px_120px_auto]' : ''}">
				<input name="{prefix}_label" bind:value={row.label} placeholder="Entry, VIP, Early bird…" aria-label="What the venue calls it" class="input h-11 min-w-0" />
				<input name="{prefix}_amount" bind:value={row.amount} inputmode="numeric" placeholder="0 = free" aria-label="Amount, UGX" class="input h-11 font-mono" />
				{#if timing}
					<select name="{prefix}_timing" bind:value={row.timing} aria-label="When it’s paid" class="input col-span-2 h-11 sm:col-span-1">
						<option value="">—</option>
						<option value="GATE">at the gate</option>
						<option value="ADVANCE">in advance</option>
					</select>
				{:else}
					<input type="hidden" name="{prefix}_timing" value={row.timing} />
				{/if}
				<div class="flex items-center gap-1 {timing ? 'col-start-3 row-start-1 sm:col-start-auto' : ''}">
					<button type="button" class="h-11 px-2 font-mono text-[11px] text-dim hover:text-fg" aria-expanded={row.more} onclick={() => (row.more = !row.more)} title="Per table, or on sale until a date">…</button>
					{#if rows.length > 1}
						<button type="button" class="h-11 px-2 text-dim hover:text-energy" onclick={() => rows.splice(i, 1)} aria-label="Remove this price">×</button>
					{/if}
				</div>
			</div>
			{#if row.more}
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
					<!-- A table is a different unit: listed apart, never the "from" price. -->
					<label class="inline-flex h-9 cursor-pointer items-center gap-1.5"><input type="checkbox" bind:checked={row.perTable} /> per table, not per person</label>
					{#if row.perTable}
						<label class="inline-flex items-center gap-1.5">seats <input name="{prefix}_seats" bind:value={row.seats} inputmode="numeric" class="input h-9 w-16 font-mono" placeholder="—" /></label>
					{:else}
						<input type="hidden" name="{prefix}_seats" value="" />
					{/if}
					<!-- An early bird past its date is a price nobody can buy: it drops out of the floor by itself. -->
					<label class="inline-flex items-center gap-1.5">on sale until <input name="{prefix}_until" type="date" bind:value={row.until} min={today} class="input h-9" /></label>
				</div>
			{:else}
				<input type="hidden" name="{prefix}_seats" value={row.seats} />
				<input type="hidden" name="{prefix}_until" value={row.until} />
			{/if}
		</div>
	{/each}
	<button type="button" class="h-11 rounded-md border border-dashed border-line px-3 text-sm text-dim hover:border-dim hover:text-fg" onclick={add}>+ Add a price</button>
</div>
