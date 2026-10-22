<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { kampalaToday, shortDate } from '#lib/build/week.js';
	import { placeResolver } from '#lib/place.js';
	import { similarVenues } from '#lib/venues.js';
	import { dialNumber, showPhones } from '#lib/phones.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Filter = 'no-number' | 'unverified' | 'no-zone' | 'all';
	type Row = {
		id: string;
		name: string;
		location: string | null;
		phone: string; // the draft in the input: every number, " / "-joined
		saved: string | null; // what the database holds, joined the same way
		dials: string | null; // the number a call dials — what the WhatsApp flag is about
		whatsapp: boolean;
		zoneName: string;
		verifiedAt: string | null;
		updatedAt: string;
		status: 'idle' | 'saving' | 'saved' | 'error';
		error: string | null;
	};

	// A local copy the page edits in place: saving a row never reloads or re-sorts the table.
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(
		data.venues.map((v) => ({
			id: v.id,
			name: v.name,
			location: v.location,
			phone: showPhones(v.phones),
			saved: showPhones(v.phones) || null,
			dials: dialNumber(v),
			whatsapp: v.whatsapp,
			zoneName: v.zoneName ?? '',
			verifiedAt: v.phoneVerifiedAt,
			updatedAt: v.updatedAt,
			status: 'idle',
			error: null
		}))
	);

	let filter = $state<Filter>('no-number');
	let search = $state('');
	let sort = $state<'name' | 'zone'>('name');
	// Rows edited under the current filter stay put, so filling a number doesn't
	// pull the row out from under the cursor. Cleared when the filter changes.
	let kept = $state(new Set<string>());

	const inFilter = (r: Row, f: Filter) =>
		f === 'no-number' ? !r.saved : f === 'unverified' ? !!r.saved && !r.verifiedAt : f === 'no-zone' ? !r.zoneName : true;

	const visible = $derived(
		rows
			.filter((r) => (kept.has(r.id) || inFilter(r, filter)) && r.name.toLowerCase().includes(search.trim().toLowerCase()))
			.sort((a, b) =>
				sort === 'zone'
					? (a.zoneName || '~').localeCompare(b.zoneName || '~') || a.name.localeCompare(b.name)
					: a.name.localeCompare(b.name)
			)
	);
	const counts = $derived({
		'no-number': rows.filter((r) => inFilter(r, 'no-number')).length,
		unverified: rows.filter((r) => inFilter(r, 'unverified')).length,
		'no-zone': rows.filter((r) => inFilter(r, 'no-zone')).length,
		all: rows.length
	});
	const withNumber = $derived(rows.filter((r) => r.saved).length);

	function setFilter(f: Filter) {
		filter = f;
		kept = new Set();
	}

	const forms: Record<string, HTMLFormElement> = {};
	const inputs: Record<string, HTMLInputElement> = {};

	function save(r: Row) {
		if (r.status === 'saving') return;
		forms[r.id]?.requestSubmit();
	}

	function onPhoneKey(e: KeyboardEvent, r: Row) {
		if (e.key === 'Enter') {
			e.preventDefault();
			save(r);
			return;
		}
		if (e.key !== 'Tab') return;
		// Tab walks the phone column: this row's number to the next row's number.
		e.preventDefault();
		if (r.phone.trim() !== (r.saved ?? '')) save(r);
		const i = visible.findIndex((v) => v.id === r.id);
		const next = visible[i + (e.shiftKey ? -1 : 1)];
		if (next) inputs[next.id]?.focus();
	}

	function onPhoneBlur(r: Row) {
		if (r.phone.trim() !== (r.saved ?? '')) save(r);
	}

	const submitRow = (r: Row) => () => {
		const sent = r.phone.trim();
		r.status = 'saving';
		r.error = null;
		kept.add(r.id);
		kept = new Set(kept);
		return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
			if (result.type === 'success' && result.data?.saved) {
				const s = result.data.saved as { phones: string[]; verifiedPhone: string | null; whatsapp: boolean; zoneName: string | null; phoneVerifiedAt: string | null; updatedAt: string };
				const typed = r.phone.trim();
				r.saved = showPhones(s.phones) || null;
				r.dials = dialNumber(s);
				// Show the tidied list — unless something new was typed while the save was in flight.
				if (typed === sent) r.phone = r.saved ?? '';
				r.whatsapp = s.whatsapp;
				r.zoneName = s.zoneName ?? '';
				r.verifiedAt = s.phoneVerifiedAt;
				r.updatedAt = s.updatedAt;
				r.status = 'saved';
				setTimeout(() => {
					if (r.status === 'saved') r.status = 'idle';
				}, 1800);
			} else {
				r.status = 'error';
				r.error = (result.data?.error as string) ?? 'The save failed.';
			}
			await tick();
		};
	};

	const statusOf = (r: Row) =>
		!r.saved
			? { text: 'no number', tone: 'text-social' }
			: r.verifiedAt
				? { text: `verified ${shortDate(kampalaToday(new Date(r.verifiedAt)))}`, tone: 'text-vetted' }
				: { text: 'unverified', tone: 'text-dim' };

	// ── The blank row: a venue with no night yet. ──
	// svelte-ignore state_referenced_locally
	const place = placeResolver(data.areas);
	const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const blank = () => ({ name: '', id: '', zoneName: '', location: '', phone: '', whatsapp: false });

	let adding = $state(false);
	let draft = $state(blank());
	let readFrom = $state<string | null>(null); // the area the zone was read from; null once someone picks a zone
	let dupes = $state<Row[]>([]);
	let different = $state(false); // "Different — add it"
	let creating = $state(false);
	let createError = $state<string | null>(null);
	let createForm = $state<HTMLFormElement>();
	let nameInput = $state<HTMLInputElement>();

	async function startAdding() {
		adding = true;
		await tick();
		nameInput?.focus();
	}

	function discard() {
		draft = blank();
		readFrom = null;
		dupes = [];
		different = false;
		createError = null;
		adding = false;
	}

	// An empty zone fills itself from the address; a zone someone chose is left alone.
	// If nothing resolves the zone stays empty and nothing is said.
	function readZone() {
		if (draft.zoneName && !readFrom) return;
		const areas = place.areasFromLocation(draft.location);
		const { zone } = place.zoneForAreas(areas);
		draft.zoneName = zone ?? '';
		readFrom = zone ? areas[0] : null;
	}

	function checkName() {
		dupes = similarVenues(draft.name, rows);
	}

	function create() {
		if (creating || !draft.name.trim()) return;
		checkName();
		if (dupes.length && !different) return; // the warning is showing; "Different — add it" proceeds
		createForm?.requestSubmit();
	}

	function onDraftKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			create();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			discard();
		}
	}

	const submitCreate = () => {
		creating = true;
		createError = null;
		return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
			creating = false;
			if (result.type === 'success' && result.data?.created) {
				const v = result.data.created as { id: string; name: string; location: string | null; zoneName: string | null; phones: string[]; verifiedPhone: string | null; whatsapp: boolean; phoneVerifiedAt: string | null; updatedAt: string };
				rows.push({
					id: v.id,
					name: v.name,
					location: v.location,
					phone: showPhones(v.phones),
					saved: showPhones(v.phones) || null,
					dials: dialNumber(v),
					whatsapp: v.whatsapp,
					zoneName: v.zoneName ?? '',
					verifiedAt: v.phoneVerifiedAt,
					updatedAt: v.updatedAt,
					status: 'idle',
					error: null
				});
				// Ready for the next one, without reaching for the mouse.
				discard();
				await startAdding();
			} else {
				createError = (result.data?.error as string) ?? 'The save failed. Nothing was written.';
			}
		};
	};

	const FILTERS: [Filter, string][] = [
		['no-number', 'No number'],
		['unverified', 'Unverified'],
		['no-zone', 'No zone'],
		['all', 'All']
	];
</script>

<svelte:head><title>Venues · {withNumber} of {rows.length} have a number</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">The register</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Venues</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<ThisWeek />
			<a href="/acts" class="btn">Acts</a>
			<a href="/build?week={data.currentWeek}" class="btn">Sunday Build</a>
		</nav>
	</header>

	<div class="space-y-4 px-4 py-5 sm:px-6">
		<p class="text-sm">
			<strong class={withNumber ? 'text-fg' : 'text-social'}>{withNumber} of {rows.length}</strong> have a number.
			<span class="text-dim">Type a number and press Enter, or Tab to the next row — each row saves on its own. Two numbers in a bio? Paste them as they are: <span class="font-mono">0773814441 / 0703944142</span>. Saving a number here is not a call: the call queue is untouched.</span>
		</p>

		<div class="flex flex-wrap items-center gap-2">
			{#each FILTERS as [key, label] (key)}
				<button
					type="button"
					class="h-11 rounded-md border px-3 text-sm {filter === key ? 'border-chill bg-chill/10' : 'border-line hover:border-dim'}"
					onclick={() => setFilter(key)}
				>
					{label} <span class="font-mono text-xs text-dim">{counts[key]}</span>
				</button>
			{/each}
			<button type="button" class="btn h-11" onclick={startAdding}>+ Add venue</button>
			<input class="input h-11 w-56" placeholder="Search names" bind:value={search} oninput={() => (kept = new Set())} />
			<label class="ml-auto flex items-center gap-2 text-sm text-dim">
				Sort
				<select class="input h-11 w-auto" bind:value={sort}>
					<option value="name">by name</option>
					<option value="zone">by zone</option>
				</select>
			</label>
		</div>

		<div class="hidden grid-cols-[minmax(0,1.3fr)_170px_minmax(0,1.3fr)_200px_70px_130px] gap-3 px-3 font-mono text-[10px] tracking-wider text-dim uppercase md:grid">
			<span>Name</span><span>Zone</span><span>Location</span><span>Phones</span><span title="Whether the number a call dials is on WhatsApp: the verified one, else the first">WA · dialled</span><span>Status</span>
		</div>

		{#if adding}
			<!-- Enter saves and Escape discards from any field in the row. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<form
				method="POST"
				action="?/create"
				bind:this={createForm}
				use:enhance={submitCreate}
				onkeydown={onDraftKey}
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-md border border-chill/60 bg-chill/5 px-3 py-2 text-sm md:grid-cols-[minmax(0,1.3fr)_170px_minmax(0,1.3fr)_200px_70px_130px]"
			>
				<input
					name="name"
					class="input col-span-2 h-11 font-semibold md:col-span-1"
					placeholder="Venue name, as they brand it"
					autocomplete="off"
					bind:value={draft.name}
					bind:this={nameInput}
					oninput={() => ((different = false), (dupes = []))}
					onblur={checkName}
					aria-label="New venue name"
				/>
				<select
					name="zoneName"
					class="input h-11 font-mono text-xs {draft.zoneName ? '' : 'text-social'}"
					bind:value={draft.zoneName}
					onchange={() => (readFrom = null)}
					aria-label="Zone for the new venue"
				>
					<option value="">NO ZONE</option>
					{#each data.zones as z (z.name)}<option value={z.name}>{z.name}</option>{/each}
				</select>
				<input
					name="location"
					class="input col-span-2 h-11 text-xs md:col-span-1"
					placeholder="Address, as the venue gives it"
					autocomplete="off"
					bind:value={draft.location}
					oninput={readZone}
					aria-label="Location of the new venue"
				/>
				<input name="phone" type="tel" inputmode="tel" autocomplete="off" class="input h-11 font-mono" placeholder="0772 123456 / 0703 …" bind:value={draft.phone} aria-label="Phone numbers for the new venue" />
				<label class="flex h-11 items-center gap-2 text-xs text-dim md:justify-center">
					<input type="checkbox" name="whatsapp" class="size-5" bind:checked={draft.whatsapp} aria-label="The new venue is on WhatsApp" />
					<span class="md:hidden">WhatsApp</span>
				</label>
				<button type="button" class="btn-primary h-11" disabled={creating || !draft.name.trim()} onclick={create}>
					{creating ? 'adding…' : 'Add'}
				</button>

				<div class="col-span-2 space-y-1.5 text-xs md:col-span-6">
					{#if readFrom}
						<p class="text-dim">
							<span class="font-mono text-[10px] tracking-wider text-chill uppercase">auto</span>
							read “{readFrom}” out of the address and placed it. Change it if it’s wrong.
						</p>
					{/if}
					{#if dupes.length}
						<div class="rounded-md border border-social/60 bg-social/5 px-3 py-2">
							<p class="text-social">Already in the register? Two rows for one venue split its history.</p>
							<ul class="mt-1 space-y-0.5">
								{#each dupes as d (d.id)}
									<li>
										<a href="/venues/{d.id}" class="font-semibold text-chill underline">{d.name}</a>
										<span class="font-mono text-dim">· {d.zoneName || 'NO ZONE'} · {d.location ?? 'no location'}</span>
									</li>
								{/each}
							</ul>
							{#if different}
								<p class="mt-1 text-dim">Noted as a different venue — Enter adds it.</p>
							{:else}
								<button type="button" class="btn mt-2 h-9" onclick={() => ((different = true), create())}>Different — add it</button>
							{/if}
						</div>
					{/if}
					<label class="flex flex-wrap items-center gap-2 text-dim">
						id
						<input
							name="id"
							class="input h-8 w-56 font-mono text-xs"
							placeholder={slug(draft.name) || 'from the name'}
							autocomplete="off"
							bind:value={draft.id}
							aria-label="Id for the new venue"
						/>
						<span>— set now or never: it doesn’t change on rename. Lands as Tier C, due a call today. Esc discards.</span>
					</label>
					{#if createError}<p class="text-energy">{createError}</p>{/if}
				</div>
			</form>
		{/if}

		{#if visible.length === 0}
			<p class="rounded-md border border-dashed border-line px-4 py-3 text-sm text-dim">Nothing matches.</p>
		{/if}

		<div class="space-y-1.5">
			{#each visible as r (r.id)}
				{@const status = statusOf(r)}
				<form
					method="POST"
					action="?/contact"
					bind:this={forms[r.id]}
					use:enhance={submitRow(r)}
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[minmax(0,1.3fr)_170px_minmax(0,1.3fr)_200px_70px_130px]
						{r.status === 'error' ? 'border-energy/60 bg-energy/5' : r.status === 'saved' ? 'border-vetted/60' : 'border-line bg-panel'}"
				>
					<input type="hidden" name="id" value={r.id} />
					<input type="hidden" name="updatedAt" value={r.updatedAt} />
					<a href="/venues/{r.id}" class="col-span-2 font-semibold hover:text-chill md:col-span-1" tabindex="-1">{r.name}</a>
					<select
						name="zoneName"
						class="input h-11 font-mono text-xs {r.zoneName ? '' : 'text-social'}"
						bind:value={r.zoneName}
						onchange={() => save(r)}
						aria-label="Zone for {r.name}"
					>
						<option value="">NO ZONE</option>
						{#each data.zones as z (z.name)}<option value={z.name}>{z.name}</option>{/each}
					</select>
					<span class="col-span-2 truncate text-xs text-dim md:col-span-1" title={r.location}>{r.location ?? '—'}</span>
					<input
						name="phone"
						type="tel"
						inputmode="tel"
						autocomplete="off"
						class="input h-11 font-mono"
						placeholder="0772 123456"
						title={r.saved ?? undefined}
						bind:value={r.phone}
						bind:this={inputs[r.id]}
						onkeydown={(e) => onPhoneKey(e, r)}
						onblur={() => onPhoneBlur(r)}
						aria-label="Phone numbers for {r.name}"
					/>
					<label class="flex h-11 items-center gap-2 text-xs text-dim md:justify-center">
						<input type="hidden" name="whatsapp" value={r.whatsapp ? 'true' : 'false'} />
						<input type="checkbox" class="size-5" bind:checked={r.whatsapp} onchange={() => save(r)} aria-label="{r.dials ?? r.name} is on WhatsApp" title="About {r.dials ?? 'the number a call dials'}" />
						<span class="md:hidden">WhatsApp{r.dials ? ` · ${r.dials}` : ''}</span>
					</label>
					<span class="font-mono text-xs {r.status === 'error' ? 'text-energy' : status.tone}">
						{r.status === 'saving' ? 'saving…' : r.status === 'saved' ? 'saved ✓' : r.status === 'error' ? 'not saved' : status.text}
					</span>
					{#if r.error}
						<p class="col-span-2 text-xs text-energy md:col-span-6">{r.error}</p>
					{/if}
				</form>
			{/each}
		</div>
	</div>
</div>
