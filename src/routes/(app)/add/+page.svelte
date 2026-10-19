<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { DAYS, PROVENANCE, REPEATS, isoDay, nextOn, type Provenance, type Repeat } from '#lib/build/add.js';
	import { dayHeading, shillings } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const CATEGORIES = ['LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'SPORTS_SCREENING', 'THEMED_NIGHT', 'MOVIE_NIGHT', 'OTHER'];
	const REGISTER_TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };
	const label = (s: string) => s.replaceAll('_', ' ');
	const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	// 1 · where
	// svelte-ignore state_referenced_locally — seeds the form once.
	let venueId = $state(data.venueId ?? '');
	let query = $state('');
	let adding = $state(false);
	let newName = $state('');
	// 2 · what
	let eventName = $state('');
	let category = $state('');
	let duplicate = $state<'existing' | 'separate'>('existing');
	// 3 · repeat
	let repeat = $state<Repeat | ''>('');
	let day = $state('');
	let date = $state('');
	let residencyId = $state('');
	let runningSince = $state('');
	// 4 · when and cost
	let start = $state('');
	let end = $state('');
	let gate = $state('');
	let advance = $state('');
	let register = $state('');
	// 5 · provenance — no default, on purpose
	let provenance = $state<Provenance | ''>('');
	let source = $state('');
	let vetted = $state(false);

	let saving = $state(false);
	let formEl: HTMLFormElement;

	const venue = $derived(data.venues.find((v) => v.id === venueId));
	const matches = $derived(
		query.trim().length < 2
			? []
			: data.venues.filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
	);
	const nights = $derived(data.residencies.filter((r) => r.venueId === venueId));
	const existing = $derived(
		eventName.trim() ? nights.find((r) => r.eventName.toLowerCase() === eventName.trim().toLowerCase()) : undefined
	);
	const replaces = $derived(nights.find((r) => r.id === residencyId));
	const prov = $derived(PROVENANCE.find((p) => p.key === provenance));
	const weekly = $derived(repeat === 'weekly');
	const updating = $derived(weekly && existing && duplicate === 'existing');

	// The day the options talk about: the rule's own, or the one being replaced.
	const dayNumber = $derived(weekly ? Number(day) || 0 : (replaces?.dayOfWeek ?? existing?.dayOfWeek ?? 0));
	const dayName = $derived(DAYS[dayNumber] || (weekly ? 'week' : 'night'));

	// Pick the source sub-option and the night being replaced sensibly as answers change.
	$effect(() => {
		if (prov && !prov.sources.some((s) => s.key === source)) source = prov.sources[0].key;
		if (provenance !== 'attended') vetted = false;
	});
	$effect(() => {
		if ((repeat === 'override' || repeat === 'cancelled') && !nights.some((r) => r.id === residencyId)) {
			residencyId = existing?.id ?? nights[0]?.id ?? '';
		}
	});

	function useExisting() {
		if (!existing) return;
		duplicate = 'existing';
		category = existing.category;
		day = String(existing.dayOfWeek);
		start = existing.startTime ?? start;
		end = existing.endTime ?? end;
		gate = existing.priceGate != null ? String(existing.priceGate) : gate;
		register = existing.register;
		runningSince = existing.runningSince ?? runningSince;
	}
	// Matching an existing night pre-fills from it once, so an update starts from what's on file.
	let filledFrom = '';
	$effect(() => {
		if (existing && existing.id !== filledFrom) {
			filledFrom = existing.id;
			if (!category) useExisting();
		}
	});

	// What lands where, for the preview.
	const landsOn = $derived(weekly ? (dayNumber ? nextOn(data.today, dayNumber) : '') : date);
	const outcome = $derived.by(() => {
		if (repeat === 'cancelled') return { text: 'cancelled — the standing night drops out that week', tone: 'text-dim' };
		if (!prov) return { text: 'source not given', tone: 'text-dim' };
		if (!prov.confirms) return { text: 'lead — needs a call', tone: 'text-dim' };
		if (!start || !register) return { text: `needs ${!start ? 'a time' : 'a register'}`, tone: 'text-social' };
		return { text: 'publishable', tone: 'text-vetted' };
	});
	const claim = $derived(vetted ? 'VETTED' : prov?.claim ?? null);

	const preview = $derived.by((): { op: string; rows: [string, string, string?][] } => {
		const v = venueId || (newName ? slug(newName) : '—');
		const c = (x: string | null | undefined, tone = '') => [x || 'null', x ? tone : 'text-social'] as const;
		if (weekly) {
			return {
				op: `${updating ? 'UPDATE' : 'INSERT'} Residency`,
				rows: [
					['id', updating ? existing!.id : `${v}-${slug(eventName) || '…'}`],
					['venueId', v],
					['dayOfWeek', day || '—'],
					['startTime', ...c(start, 'text-vetted')],
					['priceGate', gate || 'null'],
					['register', ...c(register, REGISTER_TONE[register])],
					['runningSince', ...c(runningSince)],
					['lastConfirmed', prov?.confirms ? 'now()' : 'null', prov?.confirms ? 'text-vetted' : 'text-social'],
					['claimType', ...c(claim)],
					['source', ...c(prov ? source : null)],
					['active', 'true']
				]
			};
		}
		return {
			op: 'INSERT Occurrence',
			rows: [
				['id', `${slug(eventName || replaces?.eventName || '') || '…'}-${date || '…'}`],
				['venueId', v],
				...(repeat === 'override' || repeat === 'cancelled' ? [['residencyId', residencyId || '—'] as [string, string]] : []),
				['date', date || '—'],
				...(repeat === 'cancelled'
					? [['status', 'CANCELLED', 'text-energy'] as [string, string, string]]
					: [
							['startTime', ...c(start, 'text-vetted')] as [string, string, string],
							['priceGate', gate || 'null'] as [string, string],
							['priceAdvance', advance || 'null'] as [string, string],
							['register', ...c(register, REGISTER_TONE[register])] as [string, string, string],
							['status', prov?.confirms ? 'CONFIRMED' : 'LEAD', prov?.confirms ? 'text-vetted' : 'text-social'] as [string, string, string]
						]),
				['claimType', ...c(claim)],
				['source', ...c(prov ? source : null)]
			]
		};
	});

	const summary = $derived(
		[
			{ weekly: 'a standing night', once: 'a one-off', override: 'an override', cancelled: 'a cancellation', '': 'an entry' }[repeat],
			claim ?? 'no claim',
			prov ? (prov.confirms ? `confirmed by ${data.caller}` : 'stays a lead') : 'source not given'
		].join(', ')
	);

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			formEl.requestSubmit();
		} else if (e.key === 'Escape') {
			goto('/build');
		}
	}
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Add to the register</title></svelte:head>

<form
	method="POST"
	action="?/save"
	bind:this={formEl}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="min-h-screen bg-ink pb-28 text-fg"
>
	<header class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-4 py-5 sm:px-6">
		<div class="flex items-center gap-3">
			<span class="mr-2"><HomeLogo week={data.currentWeek} /></span>
			<span class="grid size-9 place-items-center rounded-md bg-fg text-xl font-bold text-ink">+</span>
			<div>
				<h1 class="text-xl font-semibold">Add to the register</h1>
				<p class="text-sm text-dim">Answer what you know. Which table it lands in is worked out from that.</p>
			</div>
		</div>
		<p class="text-right font-mono text-xs text-dim">esc to cancel<br />⌘↵ to save</p>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0 space-y-4">
			<!-- 1 · Where is it? -->
			<section class="panel space-y-3">
				<h2 class="step"><span>1</span>Where is it?</h2>
				{#if venue}
					<input type="hidden" name="venueId" value={venue.id} />
					<div class="flex items-start justify-between rounded-md border border-chill/40 bg-chill/5 px-4 py-3">
						<div>
							<p class="font-semibold">{venue.name}</p>
							<p class="font-mono text-[11px] text-dim">
								{[venue.zone ?? 'NO ZONE', venue.division, venue.location].filter(Boolean).join(' · ')}
							</p>
						</div>
						<button type="button" class="text-xs text-chill" onclick={() => ((venueId = ''), (query = ''))}>change</button>
					</div>
				{:else if adding}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="field sm:col-span-2"><span>Venue name, as it brands itself</span><input name="new_name" class="input" bind:value={newName} /></label>
						<label class="field"><span>Location — directions a punter would give</span><input name="new_location" class="input" /></label>
						<label class="field"><span>Zone</span>
							<select name="new_zone" class="input">
								<option value="">not placed yet</option>
								{#each data.zones as z (z.name)}<option value={z.name}>{z.name} · {z.division}</option>{/each}
							</select>
						</label>
					</div>
					<button type="button" class="text-xs text-chill" onclick={() => ((adding = false), (newName = ''))}>search the register instead</button>
				{:else}
					<input class="input" placeholder="Search {data.venues.length} venues" bind:value={query} />
					{#if matches.length}
						<ul class="divide-y divide-line rounded-md border border-line">
							{#each matches as m (m.id)}
								<li>
									<button type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-line/40" onclick={() => (venueId = m.id)}>
										{m.name} <span class="font-mono text-[10px] text-dim">{m.zone ?? 'NO ZONE'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<p class="text-xs text-dim">
						Not in the register yet? <button type="button" class="text-chill" onclick={() => (adding = true)}>Add the venue here</button>
						— nothing can be saved without one.
					</p>
				{/if}
			</section>

			<!-- 2 · What is it? -->
			<section class="panel space-y-3">
				<h2 class="step"><span>2</span>What is it?</h2>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
					<label class="field"><span>Event name, as they brand it</span><input name="eventName" class="input" bind:value={eventName} placeholder={replaces?.eventName ?? ''} /></label>
					<label class="field"><span>Category</span>
						<select name="category" class="input" bind:value={category}>
							<option value="">—</option>
							{#each CATEGORIES as c (c)}<option value={c}>{label(c)}</option>{/each}
						</select>
					</label>
				</div>
				{#if existing && (repeat === '' || weekly)}
					<input type="hidden" name="duplicate" value={duplicate} />
					<p class="rounded-md border border-social/40 bg-social/10 px-3 py-2 text-xs">
						<span class="mr-1 text-social">!</span>
						<strong>{venue?.name} already has {existing.eventName} on {DAYS[existing.dayOfWeek]}s.</strong>
						{duplicate === 'existing'
							? 'Saving will update that rule rather than create a second one.'
							: 'Saving will add a second, separate standing night.'}
						<button type="button" class="text-social underline" onclick={useExisting}>Use the existing night</button> ·
						<button type="button" class="text-social underline" onclick={() => (duplicate = 'separate')}>Make a separate entry</button>
					</p>
				{/if}
			</section>

			<!-- 3 · Does it repeat? -->
			<section class="panel space-y-3">
				<h2 class="step"><span>3</span>Does it repeat?</h2>
				<p class="text-xs text-dim">
					Question 4 on the call script. The answer decides whether this is a rule or a dated row — you never pick the table.
				</p>
				<input type="hidden" name="repeat" value={repeat} />
				<div class="space-y-2">
					{#each REPEATS as r (r.key)}
						{@const needsNight = r.key === 'override' || r.key === 'cancelled'}
						<button
							type="button"
							disabled={needsNight && !nights.length}
							class="flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm disabled:opacity-40
								{repeat === r.key ? 'border-chill bg-chill/10' : 'border-line hover:border-dim'}"
							onclick={() => (repeat = r.key)}
						>
							<span>{r.label(r.key === 'weekly' ? DAYS[Number(day)] || 'week' : DAYS[replaces?.dayOfWeek ?? existing?.dayOfWeek ?? 0] || 'night')}</span>
							<span class="font-mono text-[10px] tracking-wider {repeat === r.key ? 'text-chill' : 'text-dim'}">{r.writes}</span>
						</button>
					{/each}
				</div>

				{#if weekly}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="field"><span>Which night</span>
							<select name="day" class="input" bind:value={day}>
								<option value="">—</option>
								{#each DAYS.slice(1) as d, i (d)}<option value={String(i + 1)}>{d}</option>{/each}
							</select>
						</label>
						<label class="field"><span>How long has it been running?</span>
							<input name="runningSince" type="month" class="input" bind:value={runningSince} max={data.today.slice(0, 7)} />
						</label>
					</div>
				{:else if repeat}
					<div class="grid gap-3 sm:grid-cols-2">
						{#if repeat === 'override' || repeat === 'cancelled'}
							<label class="field"><span>Which standing night</span>
								<select name="residencyId" class="input" bind:value={residencyId}>
									{#each nights as n (n.id)}<option value={n.id}>{DAYS[n.dayOfWeek]} · {n.eventName}</option>{/each}
								</select>
							</label>
						{/if}
						<label class="field"><span>Date</span>
							<input name="date" type="date" class="input" bind:value={date} />
							{#if replaces && date && isoDay(date) !== replaces.dayOfWeek}
								<span class="text-energy">{replaces.eventName} is on {DAYS[replaces.dayOfWeek]}s — that date is a {DAYS[isoDay(date)]}.</span>
							{/if}
						</label>
					</div>
				{/if}
			</section>

			<!-- 4 · When, and what it costs -->
			{#if repeat !== 'cancelled'}
				<section class="panel space-y-3">
					<h2 class="step"><span>4</span>When, and what it costs</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<label class="field"><span>Starts</span><input name="start" class="input" placeholder="19:00" bind:value={start} />
							{#if !start}<span class="text-social">Required to publish — a row without one cannot be forwarded.</span>{/if}
						</label>
						<label class="field"><span>Wraps</span><input name="end" class="input" placeholder="22:00" bind:value={end} /></label>
						<label class="field"><span>At the gate</span><input name="gate" class="input" inputmode="numeric" placeholder="0 for free" bind:value={gate} />
							{#if gate}<span>{shillings(Number(gate.replace(/[,\s]/g, '')))}</span>{/if}
						</label>
						<label class="field"><span>In advance</span>
							<input name="advance" class="input" inputmode="numeric" placeholder="—" bind:value={advance} disabled={weekly} title={weekly ? 'Standing nights carry one gate price' : ''} />
						</label>
					</div>
					<label class="field"><span>Register</span>
						<select name="register" class="input" bind:value={register}>
							<option value="">—</option>
							<option value="CHILL">CHILL</option>
							<option value="SOCIAL">SOCIAL</option>
							<option value="HIGH_ENERGY">HIGH-ENERGY</option>
						</select>
					</label>
					{#if venue && !venue.tested}
						<p class="text-xs text-chill">
							{venue.name} has no conversation test on file, so this is your guess, not a finding. Ask question 6 next time you
							call and it becomes a fact.
						</p>
					{/if}
				</section>
			{/if}

			<!-- 5 · Where did this come from? -->
			<section class="panel space-y-3 border-chill/40 bg-chill/5">
				<h2 class="step"><span>5</span>Where did this come from?</h2>
				<p class="text-xs text-chill">
					No default on purpose. The source sets what PartyWeya may claim and whether the row can publish at all — a quiet
					default here is how a register ends up saying everything came from Instagram.
				</p>
				<input type="hidden" name="provenance" value={provenance} />
				<div class="grid gap-2 sm:grid-cols-2">
					{#each PROVENANCE as p (p.key)}
						<button
							type="button"
							class="rounded-md border px-4 py-3 text-left text-sm {provenance === p.key ? 'border-vetted bg-ink' : 'border-line hover:border-dim'}"
							onclick={() => (provenance = p.key)}
						>
							<span class="block">{p.label}</span>
							<span class="font-mono text-[11px] {provenance === p.key ? 'text-vetted' : 'text-dim'}">{p.effect}</span>
						</button>
					{/each}
				</div>
				{#if prov && prov.sources.length > 1}
					<label class="field"><span>More exactly</span>
						<select name="source" class="input" bind:value={source}>
							{#each prov.sources as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
						</select>
					</label>
				{:else if prov}
					<input type="hidden" name="source" value={source} />
				{/if}
				{#if provenance === 'attended'}
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" name="vetted" bind:checked={vetted} />
						<span>Claim it <span class="font-mono text-vetted">VETTED</span> — PartyWeya was in the room and judged it.</span>
					</label>
				{/if}
			</section>
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">What this will write</h3>
				<p class="mb-2 font-mono text-xs text-chill">{repeat ? preview.op : '—'}</p>
				{#if repeat}
					<dl class="space-y-1 font-mono text-[11px]">
						{#each preview.rows as [k, v, tone] (k)}
							<div class="flex justify-between gap-3"><dt class="text-dim">{k}</dt><dd class="truncate {tone ?? ''}">{v}</dd></div>
						{/each}
					</dl>
					<p class="mt-3 text-xs text-dim">
						{#if weekly}
							A rule, so it fills every {dayName === 'week' ? 'week' : dayName} from now on. No dated rows are written.
						{:else if repeat === 'override'}
							Replaces the standing night for that date only.
						{:else if repeat === 'cancelled'}
							Takes the standing night out for that date only.
						{:else}
							One dated row. If one with the same name and date exists, it is updated instead.
						{/if}
					</p>
				{:else}
					<p class="text-xs text-dim">Answer question 3 to see the row.</p>
				{/if}
			</section>

			<section class="panel">
				<h3 class="panel-title mb-3">Then it lands on</h3>
				{#if landsOn}
					<div class="rounded-md border border-dashed border-line px-3 py-2">
						<p class="font-mono text-[10px] tracking-wider text-dim">{dayHeading(landsOn)}</p>
						<p class="text-sm">{eventName || replaces?.eventName || '…'} · {venue?.name ?? (newName || '…')}</p>
						<p class="font-mono text-[11px] {outcome.tone}">
							{[start, register.replace('_', '-'), outcome.text].filter(Boolean).join(' · ')}
						</p>
					</div>
					<p class="mt-2 text-xs text-dim">
						The week it belongs to, with this row highlighted — so if it still cannot publish, that is the first thing you
						see rather than a flat list.
					</p>
				{:else}
					<p class="text-xs text-dim">Pick the night or the date.</p>
				{/if}
			</section>

			<section class="panel">
				<h3 class="panel-title mb-2">Not offered here</h3>
				<p class="text-xs text-fg/80">
					<span class="text-vetted">VETTED</span> appears only when the source is “I was there”. Nothing typed into a form
					can make PartyWeya’s own judgement.
				</p>
			</section>
		</aside>
	</div>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-sm text-dim">Saving as <strong class="text-fg">{summary}</strong></p>
			<a href="/build" class="btn ml-auto">Cancel</a>
			<button class="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save and open the week'}</button>
		</div>
	</footer>
</form>
