<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { DAYS } from '#lib/build/add.js';
	import { shortDate } from '#lib/build/week.js';
	import { placeResolver } from '#lib/place.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const v = $derived(data.venue);
	let saving = $state(false);

	// ── Contact: saved through the venue list's own action, /venues?/contact. ──
	const ROLES = ['OWNER', 'MANAGER', 'MARKETING', 'PROMOTER', 'HOST'];
	let contactSaving = $state(false);
	let contactSaved = $state(false);
	let contactError = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let whatsapp = $state(data.venue.whatsapp);

	// ── The venue itself: name, location, surroundings, zone. ──
	// svelte-ignore state_referenced_locally
	const place = placeResolver(data.areas);
	// svelte-ignore state_referenced_locally
	let name = $state(data.venue.name);
	// svelte-ignore state_referenced_locally
	let location = $state(data.venue.location ?? '');
	// svelte-ignore state_referenced_locally
	let areas = $state<string[]>([...data.venue.areas]);
	// svelte-ignore state_referenced_locally
	let zone = $state(data.venue.zone ?? '');
	let placing = $state(false);
	let placeForm: HTMLFormElement;

	// Empty fills itself; a zone someone chose is only ever offered a change.
	let zoneFromAddress = false; // filled from the address on this visit, so it may keep following it
	let offer = $state<{ zone: string; area: string } | null>(null);
	function readZone() {
		const read = place.areasFromLocation(location);
		const z = place.zoneForAreas(read).zone;
		offer = null;
		if (!z) return; // nothing resolves: say nothing, guess nothing
		if (!zone || zoneFromAddress) {
			zone = z;
			zoneFromAddress = true;
		} else if (z !== zone) offer = { zone: z, area: read[0] };
	}
	const pickZone = () => ((zoneFromAddress = false), (offer = null));

	// Surroundings: from the vocabulary only — a free-text area is how the zone map breaks.
	let areaDraft = $state('');
	let areaError = $state<string | null>(null);
	function addArea() {
		const a = place.canonical(areaDraft);
		if (!areaDraft.trim()) return;
		if (!a) {
			areaError = `“${areaDraft.trim()}” isn’t in the area vocabulary — pick one from the list.`;
			return;
		}
		if (!areas.includes(a)) areas.push(a);
		areaDraft = '';
		areaError = null;
	}
	const touches = $derived(place.zoneForAreas(areas).alsoTouches.filter((z) => z !== zone));

	// On save: only the FIRST surrounding is compared with the zone. The rest are
	// allowed to cross a boundary, and are shown as "also touches", not flagged.
	let mismatch = $state<{ area: string; zone: string } | null>(null);
	let keptFor = ''; // "Keep" said for this first-area/zone pair
	const firstZone = () => (areas[0] ? place.zoneForAreas([areas[0]]).zone : null);
	function resolveMismatch(use: boolean) {
		if (use && mismatch) zone = mismatch.zone;
		else keptFor = `${areas[0]}|${zone}`;
		mismatch = null;
		placeForm.requestSubmit();
	}
</script>

<svelte:head><title>{v.name}</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
					{[v.zone ?? 'NO ZONE', v.division].filter(Boolean).join(' · ')}
				</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{v.name}</h1>
				{#if v.location}<p class="text-sm text-dim">{v.location}</p>{/if}
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			{#if v.phone}
				<a href="/calls/{v.id}" class="btn">Log a call</a>
			{:else}
				<!-- The list's own status: no number, nothing to dial. -->
				<button type="button" class="btn cursor-not-allowed opacity-50" disabled title="Save a number first">Log a call · no number</button>
			{/if}
			<a href="/add?venue={v.id}" class="btn">+ Add a night</a>
			<a href="/venues" class="btn">All venues</a>
			<ThisWeek />
		</nav>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			<form
				method="POST"
				action="?/place"
				class="panel space-y-3"
				bind:this={placeForm}
				use:enhance={({ cancel }) => {
					const z = firstZone();
					if (z && z !== zone && keptFor !== `${areas[0]}|${zone}`) {
						mismatch = { area: areas[0], zone: z };
						cancel();
						return;
					}
					placing = true;
					return async ({ update }) => {
						await update({ reset: false });
						placing = false;
						zoneFromAddress = false;
					};
				}}
			>
				<input type="hidden" name="updatedAt" value={v.updatedAt} />
				<input type="hidden" name="areasSent" value="1" />
				{#each areas as a (a)}<input type="hidden" name="areas" value={a} />{/each}
				<h2 class="panel-title">The venue</h2>
				<p class="text-xs text-dim">Public, like the venue’s name and zone. Renaming keeps its id: <span class="font-mono">{v.id}</span>.</p>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_200px]">
					<label class="field"><span>Name</span><input name="name" class="input h-11" required bind:value={name} /></label>
					<label class="field"><span>Location</span>
						<input name="location" class="input h-11" placeholder="The address, as the venue would give it" bind:value={location} oninput={readZone} />
					</label>
					<label class="field"><span>Zone</span>
						<select name="zoneName" class="input h-11 font-mono text-xs {zone ? '' : 'text-social'}" bind:value={zone} onchange={pickZone}>
							<option value="">NO ZONE</option>
							{#each data.zones as z (z)}<option value={z}>{z}</option>{/each}
						</select>
					</label>
				</div>
				{#if offer}
					<p class="flex flex-wrap items-center gap-2 text-sm">
						<span>This address reads as <strong class="font-mono text-xs">{offer.zone}</strong> <span class="text-dim">(from “{offer.area}”)</span></span>
						<button type="button" class="btn h-9" onclick={() => ((zone = offer!.zone), (offer = null))}>Use it</button>
						<button type="button" class="btn h-9" onclick={() => (offer = null)}>Ignore</button>
					</p>
				{/if}

				<div class="field">
					<span>Surroundings <span class="font-normal normal-case text-dim">— what’s around the venue, not where it is. The first one is the zone’s anchor.</span></span>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each areas as a, i (a)}
							<span class="inline-flex h-9 items-center gap-1 rounded-md border px-2 text-sm {i === 0 ? 'border-chill/60' : 'border-line'}">
								{a}
								<button type="button" class="px-1 text-dim hover:text-energy" aria-label="Remove {a}" onclick={() => areas.splice(i, 1)}>×</button>
							</span>
						{/each}
						<input
							class="input h-9 w-48"
							list="area-vocabulary"
							placeholder={areas.length ? 'add another' : 'add an area'}
							bind:value={areaDraft}
							oninput={() => (areaError = null)}
							onchange={addArea}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addArea();
								}
							}}
							aria-label="Add a surrounding area"
						/>
						<datalist id="area-vocabulary">
							{#each data.areas as a (a.area)}<option value={a.area}></option>{/each}
						</datalist>
					</div>
					{#if areaError}<p class="text-xs text-energy">{areaError}</p>{/if}
					{#if touches.length}<p class="text-xs text-dim">also touches {touches.join(', ')}</p>{/if}
				</div>

				{#if mismatch}
					<div class="flex flex-wrap items-center gap-2 rounded-md border border-social/60 bg-social/5 px-3 py-2 text-sm">
						<span>
							{mismatch.area} is in <strong class="font-mono text-xs">{mismatch.zone}</strong>,
							{#if zone}but this venue is set to <strong class="font-mono text-xs">{zone}</strong>.{:else}and this venue has no zone.{/if}
						</span>
						<button type="button" class="btn h-9" onclick={() => resolveMismatch(true)}>Use {mismatch.zone}</button>
						<button type="button" class="btn h-9" onclick={() => resolveMismatch(false)}>{zone ? `Keep ${zone}` : 'Leave it empty'}</button>
					</div>
				{/if}
				{#if form?.placeError}<p class="text-sm text-energy">{form.placeError}</p>{/if}
				<div class="flex items-center gap-3">
					<button class="btn-primary h-11" disabled={placing}>{placing ? 'Saving…' : 'Save venue'}</button>
					{#if form?.placed}<span class="text-sm text-vetted">Saved ✓</span>{/if}
				</div>
			</form>

			<form
				method="POST"
				action="?/facts"
				class="panel space-y-3"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						await update({ reset: false });
						saving = false;
					};
				}}
			>
				<input type="hidden" name="updatedAt" value={v.updatedAt} />
				<h2 class="panel-title">Venue facts</h2>
				<p class="text-xs text-dim">The same on their Tuesday as their Saturday. Public, like the venue’s name and zone.</p>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
					<label class="field"><span>Dress code</span><input name="dressCode" class="input h-11" placeholder="Smart casual, no slippers" value={v.dressCode ?? ''} /></label>
					<label class="field"><span>Parking</span><input name="parkingNote" class="input h-11" placeholder="Secure parking behind the building" value={v.parkingNote ?? ''} /></label>
					<label class="field"><span>Serves food</span>
						<select name="hasFood" class="input h-11" value={v.hasFood == null ? '' : v.hasFood ? 'yes' : 'no'}>
							<option value="">not known</option><option value="yes">yes</option><option value="no">no</option>
						</select>
					</label>
				</div>
				{#if form?.error}<p class="text-sm text-energy">{form.error}</p>{/if}
				<div class="flex items-center gap-3">
					<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save facts'}</button>
					{#if form?.saved}<span class="text-sm text-vetted">Saved ✓</span>{/if}
				</div>
			</form>

			<section class="panel">
				<h2 class="panel-title mb-3">Standing nights <span class="font-normal text-dim normal-case">— open one to edit it and its offers</span></h2>
				{#if data.residencies.length === 0}<p class="text-sm text-dim">None.</p>{/if}
				<ul class="divide-y divide-line">
					{#each data.residencies as r (r.id)}
						<li><a href="/residencies/{r.id}" class="flex h-11 items-center justify-between text-sm hover:text-chill">
							<span>{r.eventName}{#if !r.active} <span class="text-energy/80">(stopped — {r.stoppedReason ?? 'no reason recorded'})</span>{/if}</span>
							<span class="font-mono text-xs text-dim">{DAYS[r.dayOfWeek]} · {r.startTime ?? 'no time'}</span>
						</a></li>
					{/each}
				</ul>
			</section>

			{#if data.occurrences.length}
				<section class="panel">
					<h2 class="panel-title mb-3">Coming up</h2>
					<ul class="divide-y divide-line">
						{#each data.occurrences as o (o.id)}
							<li><a href="/occurrences/{o.id}" class="flex h-11 items-center justify-between text-sm hover:text-chill">
								<span>{o.eventName}</span><span class="font-mono text-xs text-dim">{shortDate(o.date)} · {o.status.toLowerCase()}</span>
							</a></li>
						{/each}
					</ul>
				</section>
			{/if}
		</main>

		<aside class="space-y-4">
			<form
				method="POST"
				action="/venues?/contact"
				class="panel space-y-3"
				use:enhance={() => {
					contactSaving = true;
					contactSaved = false;
					contactError = null;
					return async ({ result }) => {
						if (result.type === 'success') {
							await invalidateAll(); // fresh updatedAt for every form, and "Log a call" goes live
							contactSaved = true;
						} else {
							contactError = (result.type === 'failure' && (result.data?.error as string)) || 'The save failed. Nothing was written.';
						}
						contactSaving = false;
					};
				}}
			>
				<input type="hidden" name="id" value={v.id} />
				<input type="hidden" name="updatedAt" value={v.updatedAt} />
				<h3 class="panel-title">Contact</h3>
				<label class="field"><span>Number</span>
					<input name="phone" type="tel" inputmode="tel" autocomplete="off" class="input h-11 font-mono {v.phone ? '' : 'placeholder:text-social'}" placeholder="no number" value={v.phone ?? ''} />
				</label>
				<label class="flex h-9 items-center gap-2 text-sm">
					<input type="hidden" name="whatsapp" value={whatsapp ? 'true' : 'false'} />
					<input type="checkbox" class="size-5" bind:checked={whatsapp} />
					On WhatsApp
				</label>
				<label class="field"><span>Ask for</span><input name="contactName" class="input h-11" placeholder="—" value={v.contactName ?? ''} /></label>
				<label class="field"><span>Role</span>
					<select name="contactRole" class="input h-11" value={v.contactRole ?? ''}>
						<option value="">—</option>
						{#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
					</select>
				</label>
				<dl class="font-mono text-xs">
					<div class="flex justify-between"><dt>Last called</dt><dd class={v.lastContacted ? '' : 'text-social'}>{v.lastContacted ? shortDate(v.lastContacted) : 'never'}</dd></div>
				</dl>
				{#if contactError}<p class="text-sm text-energy">{contactError}</p>{/if}
				<div class="flex items-center gap-3">
					<button class="btn-primary h-11" disabled={contactSaving}>{contactSaving ? 'Saving…' : 'Save contact'}</button>
					{#if contactSaved}<span class="text-sm text-vetted">Saved ✓</span>{/if}
				</div>
				<p class="text-xs text-dim">Saving a number here is not a call — the call queue is untouched.</p>
			</form>
		</aside>
	</div>
</div>
