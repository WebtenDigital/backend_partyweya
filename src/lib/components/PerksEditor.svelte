<script lang="ts" module>
	export type EditablePerk = {
		id: string | null;
		kind: string;
		label: string;
		condition: string | null;
		activeUntil: string | null; // YYYY-MM-DD, the last day it holds
		confirmedOn?: string | null; // YYYY-MM-DD — the offer's own, not its night's
	};
	export type PerkRow = {
		id: string | null;
		kind: string;
		label: string;
		condition: string;
		activeUntil: string;
		confirmedOn?: string | null;
		scope?: 'weekly' | 'once';
		confirmed?: boolean; // heard on this call to be still on
	};

	export const toRows = (perks: EditablePerk[]): PerkRow[] =>
		perks.map((p) => ({ ...p, condition: p.condition ?? '', activeUntil: p.activeUntil ?? '' }));
</script>

<script lang="ts">
	// A night's offers, edited inside a larger form and saved with it (see
	// lib/server/perks.ts). Each offer carries its own expiry, so a dead promo
	// drops out instead of quietly outliving its truth.
	//
	// On a call, two more things per offer. `scope`: "every week, or just this
	// one?" — a weekly offer belongs to the standing night, a one-off to that
	// date, and getting it wrong publishes a one-time promo every week after.
	// `confirm`: the offer's own confirmation — new ones are confirmed by being
	// heard; an existing one only when the caller ticks it as still on.
	import { dayHeading, shortDate } from '#lib/build/week.js';

	let {
		perks = [],
		rows = $bindable(toRows(perks)), // bind to read the offers live; otherwise seeded from `perks`
		today,
		weekEnd = null, // offers ending on or before this are flagged as ending this week
		prefix = 'perk', //  field names: perk_id, perk_kind … — another for a second editor on the form
		scope = null, //     offer the weekly/one-off choice, and which a new offer starts as
		confirm = false
	}: {
		perks?: EditablePerk[];
		rows?: PerkRow[];
		today: string;
		weekEnd?: string | null;
		prefix?: string;
		scope?: { start: 'weekly' | 'once'; once: string } | null;
		confirm?: boolean;
	} = $props();

	const KINDS = ['FOOD', 'DRINK', 'ENTRY', 'OTHER'];
	const add = () =>
		rows.push({ id: null, kind: 'DRINK', label: '', condition: '', activeUntil: '', scope: scope?.start, confirmed: true });
	const pickers: HTMLInputElement[] = [];

	function openPicker(i: number) {
		const input = pickers[i];
		try {
			input.showPicker();
		} catch {
			input.focus();
		}
	}
</script>

<div class="space-y-2">
	<input type="hidden" name="{prefix}s_sent" value="1" />
	<input type="hidden" name="{prefix}_count" value={rows.length} />
	{#each rows as row, i (i)}
		{@const expired = !!row.activeUntil && row.activeUntil < today}
		{@const ending = !expired && !!row.activeUntil && !!weekEnd && row.activeUntil <= weekEnd}
		<div
			class="grid grid-cols-[84px_minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1 rounded-md border bg-ink/40 px-2 py-1.5 sm:grid-cols-[84px_minmax(0,1fr)_150px_170px_32px]
				{ending ? 'border-social/60' : 'border-line'} {expired ? 'opacity-50' : ''}"
		>
			<input type="hidden" name="{prefix}_id" value={row.id ?? ''} />
			<select
				name="{prefix}_kind"
				bind:value={row.kind}
				aria-label="Kind of offer"
				class="h-9 rounded border border-line bg-transparent px-1 text-center font-mono text-[10px] tracking-wider text-dim focus:border-chill focus:outline-none"
			>
				{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
			</select>
			<input
				name="{prefix}_label"
				bind:value={row.label}
				placeholder="Half-price ribs platter"
				aria-label="Offer"
				class="h-9 min-w-0 rounded border border-transparent bg-transparent px-2 text-sm text-fg placeholder:text-dim/60 hover:border-line focus:border-chill focus:outline-none {expired ? 'text-dim' : ''}"
			/>
			<button type="button" class="h-9 rounded text-dim hover:text-energy sm:order-last" onclick={() => rows.splice(i, 1)} aria-label="Remove this offer">×</button>
			<input
				name="{prefix}_condition"
				bind:value={row.condition}
				placeholder={row.label.trim() ? '—' : 'before 21:00'}
				aria-label="Condition"
				class="col-span-2 h-9 min-w-0 rounded border border-transparent bg-transparent px-2 text-sm text-fg/80 placeholder:text-dim/60 hover:border-line focus:border-chill focus:outline-none sm:col-span-1"
			/>
			<div class="relative flex h-9 items-center gap-1">
				<button
					type="button"
					class="h-9 rounded px-1 text-left font-mono text-[11px] whitespace-nowrap hover:underline {expired ? 'text-dim' : ending ? 'text-social' : 'text-dim'}"
					onclick={() => openPicker(i)}
					title="Last day it holds — click to set"
				>
					{#if !row.activeUntil}
						no end date
					{:else if expired}
						expired {shortDate(row.activeUntil)}
					{:else}
						ends {dayHeading(row.activeUntil).slice(0, 3).toLowerCase().replace(/^./, (c) => c.toUpperCase())} {shortDate(row.activeUntil)}
					{/if}
				</button>
				{#if row.activeUntil}
					<button type="button" class="font-mono text-[10px] text-dim hover:text-fg" onclick={() => (row.activeUntil = '')} aria-label="Remove the end date">clear</button>
				{/if}
				<input
					bind:this={pickers[i]}
					name="{prefix}_until"
					type="date"
					bind:value={row.activeUntil}
					class="pointer-events-none absolute inset-0 opacity-0"
					tabindex="-1"
					aria-label="Last day it holds"
				/>
			</div>
			{#if scope || confirm}
				{@const rowScope = row.scope ?? scope?.start ?? 'weekly'}
				<div class="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 pb-0.5 text-[11px]">
					<input type="hidden" name="{prefix}_scope" value={scope ? rowScope : ''} />
					<input type="hidden" name="{prefix}_confirmed" value={confirm && row.confirmed ? '1' : ''} />
					{#if scope}
						<span class="inline-flex overflow-hidden rounded border border-line font-mono" role="group" aria-label="Every week, or just this one?">
							{#each [['weekly', 'every week'], ['once', scope.once]] as [key, text] (key)}
								<button
									type="button"
									class="h-8 px-2 {rowScope === key ? 'bg-chill/15 text-fg' : 'text-dim hover:text-fg'}"
									aria-pressed={rowScope === key}
									onclick={() => (row.scope = key as 'weekly' | 'once')}>{text}</button
								>
							{/each}
						</span>
					{/if}
					{#if confirm}
						{#if row.id}
							<label class="inline-flex h-8 cursor-pointer items-center gap-1.5 {row.confirmed ? 'text-vetted' : 'text-dim'}">
								<input type="checkbox" bind:checked={row.confirmed} />
								still on — {row.confirmedOn ? `last confirmed ${shortDate(row.confirmedOn)}` : 'never confirmed'}
							</label>
						{:else}
							<span class="text-vetted">confirmed on this call</span>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/each}
	<button type="button" class="h-11 rounded-md border border-dashed border-line px-3 text-sm text-dim hover:border-dim hover:text-fg" onclick={add}>+ Add an offer</button>
</div>
