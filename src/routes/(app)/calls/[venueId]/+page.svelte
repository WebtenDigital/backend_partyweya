<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { enhance } from '$app/forms';
	import PerksEditor from '#lib/components/PerksEditor.svelte';
	import LineupInput from '#lib/components/LineupInput.svelte';
	import Reminders from '#lib/components/Reminders.svelte';
	import OrganiserPicker from '#lib/components/OrganiserPicker.svelte';
	import { UNKNOWN_LABEL, whoToCall } from '#lib/build/who.js';
	import { claimFor } from '#lib/provenance.js';
	import type { Source } from '#lib/server/prisma.js';
	import { CADENCE, Q6 } from '#lib/build/calls.js';
	import { shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const CATEGORIES = ['LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'SPORTS_SCREENING', 'THEMED_NIGHT', 'MOVIE_NIGHT', 'OTHER'];
	const ROLES = ['OWNER', 'MANAGER', 'MARKETING', 'PROMOTER', 'HOST'];
	const SOURCES = [
		{ key: 'OWNER', label: 'the owner' },
		{ key: 'MANAGER', label: 'a manager' },
		{ key: 'PROMOTER', label: 'the promoter' },
		{ key: 'AGENT', label: 'an agent' }
	];
	const REGISTER_TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };
	const REGISTER_RING: Record<string, string> = { CHILL: 'border-chill', SOCIAL: 'border-social', HIGH_ENERGY: 'border-energy' };
	const label = (s: string) => s.replaceAll('_', '-');

	// svelte-ignore state_referenced_locally — these seed the form once; the page reloads per venue.
	let mode = $state(data.mode as 'none' | 'standing' | 'dated');
	// svelte-ignore state_referenced_locally
	let residencyId = $state(data.residencyId ?? '');
	// svelte-ignore state_referenced_locally
	let occurrenceId = $state(data.occurrenceId);
	// svelte-ignore state_referenced_locally
	let q6 = $state(data.venue.conversationTest ?? '');
	let outcome = $state('');
	let lineup = $state<string[]>([]);
	let lineupEl = $state<LineupInput>();
	// svelte-ignore state_referenced_locally
	let tier = $state(data.tier);
	let tierTouched = false;
	function pick(m: typeof mode) {
		mode = m;
		if (!tierTouched) tier = m === 'dated' ? 'C' : 'A';
	}
	let saving = $state(false);
	let formEl: HTMLFormElement;

	const residency = $derived(data.residencies.find((r) => r.id === residencyId));
	const occurrence = $derived(data.occurrences.find((o) => o.id === occurrenceId));
	// Who the rule says owns the night being logged — the same rule as the panel and the queue.
	const who = $derived(
		mode === 'standing'
			? whoToCall(null, residency)
			: mode === 'dated' && occurrence
				? whoToCall(occurrence, data.residencies.find((r) => r.id === occurrence.residencyId))
				: ({ kind: 'VENUE' } as const)
	);
	const organiser = $derived(
		who.kind !== 'ORGANISER'
			? null
			: who.from === 'occurrence'
				? occurrence?.organiser
				: (residency ?? data.residencies.find((r) => r.id === occurrence?.residencyId))?.organiser
	);
	// svelte-ignore state_referenced_locally — fixed by the link that opened this call.
	const dial = data.dial;
	let ident = $state('');
	// Question 6 and the venue's cadence belong to whoever answers for the room.
	const venueOnLine = $derived(dial === 'venue' || (dial === 'booking' && ident === 'venue'));
	// Question 8's picker edits the level being logged: the rule, or this date.
	const ownOrganiser = $derived(mode === 'standing' ? (residency?.organiserId ?? null) : mode === 'dated' ? (occurrence?.organiserId ?? null) : null);
	// The claim isn't chosen: claimFor() derives it on save from the source and the lineup. Shown here
	// so it's no surprise. Every source this screen offers derives the same way, so the default stands in.
	const billsTransferring = $derived(
		mode !== 'none' && lineup.some((n) => data.suggestions.find((s) => s.name.toLowerCase() === n.toLowerCase())?.transfers === true)
	);
	$effect(() => {
		lineup = mode === 'standing' ? [...(residency?.lineup ?? [])] : [...(occurrence?.lineup ?? [])];
	});

	// Why the cadence is what it is, beside the selector.
	const monthsRunning = $derived(
		residency?.runningSince
			? (Number(data.today.slice(0, 4)) - Number(residency.runningSince.slice(0, 4))) * 12 +
					Number(data.today.slice(5, 7)) - Number(residency.runningSince.slice(5, 7))
			: null
	);
	const tierReason = $derived(
		mode === 'dated'
			? 'Tier C: a dated night is this week’s problem — weekly until it’s on.'
			: mode === 'standing'
				? monthsRunning == null
					? 'Tier A: strictly, held 3+ months — running-since isn’t known for this night, so ask how long it’s been on.'
					: monthsRunning >= 3
						? `Tier A: held ${monthsRunning} months, since ${residency!.runningSince!.slice(0, 7)}.`
						: `Strictly not Tier A yet — running ${monthsRunning === 0 ? 'under a month' : `${monthsRunning} month${monthsRunning === 1 ? '' : 's'}`}, not 3+.`
				: ''
	);
	// A confirmed row that still can't publish: say exactly what's missing.
	const stillBlocked = $derived(
		mode === 'dated' && occurrence?.status === 'CONFIRMED'
			? [!occurrence.startTime && 'start time', occurrence.priceGate == null && 'gate price', !occurrence.register && 'register'].filter(
					(x): x is string => !!x
				)
			: []
	);

	const sameRegister = $derived(
		data.residencies.length > 1 && new Set(data.residencies.map((r) => r.register)).size === 1
	);
	const defaultSource = $derived(
		dial === 'organiser' || ident === 'promoter' ? 'PROMOTER' : ({ OWNER: 'OWNER', PROMOTER: 'PROMOTER', MANAGER: 'MANAGER', MARKETING: 'MANAGER', HOST: 'MANAGER' } as Record<string, string>)[
			data.venue.contactRole ?? ''
		] ?? 'OWNER'
	);
	const derivedClaim = $derived(mode === 'none' ? null : claimFor(defaultSource as Source, billsTransferring));
	const registerFromQ6 = $derived(Q6.find((q) => q.test === q6)?.register ?? data.venue.provisionalRegister ?? '');

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			formEl.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={onKey} />
<svelte:head>
	<title>Call · {data.venue.name}</title>
</svelte:head>

<form
	method="POST"
	action="?/save"
	bind:this={formEl}
	use:enhance={({ cancel }) => {
		if (!lineupEl?.confirm()) return cancel();
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="min-h-screen bg-ink pb-28 text-fg"
>
	<input type="hidden" name="week" value={data.week} />
	<input type="hidden" name="mode" value={mode} />
	<input type="hidden" name="dial" value={dial} />

	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/calls?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← This week</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{data.venue.name}</h1>
				<p class="font-mono text-xs text-dim">
					{[data.venue.zone ?? 'NO ZONE', data.venue.division, data.venue.location].filter(Boolean).join(' · ')}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-4">
			<a href="/add?venue={data.venue.id}" class="btn text-sm" title="Something that doesn’t fit this call">+ Add to the register</a>
			<span class="text-sm"><ThisWeek href="/calls?week={data.week}" /></span>
			<p class="text-right font-mono text-xs text-dim">logging as {data.caller}<br />⌘↵ to save</p>
		</div>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			{#if dial === 'organiser' && !organiser}
				<p class="rounded-md border border-energy/50 bg-energy/10 px-4 py-3 text-sm">
					This call was opened to dial an organiser, but the night selected has none. Pick their night, or go back and call the venue.
				</p>
			{:else if dial === 'organiser' && organiser}
				<p class="rounded-md border border-dated/50 bg-dated/10 px-4 py-3 text-sm">
					<span class="font-mono text-[10px] tracking-wider text-dated">ORGANISER’S NIGHT</span><br />
					Call <strong>{organiser.contactName ?? organiser.name}</strong>{organiser.contactName ? ` (${organiser.name})` : ''}
					{organiser.phone ? `on ${organiser.phone}` : '— no number on file yet'}, not {data.venue.name}. Asking the venue
					about a promoter’s night gets “I think so?”, which would be logged as confirmation.
				</p>
			{/if}
			{#if dial === 'booking'}
				<section class="panel space-y-3 border-social/50">
					<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">0</span>Whose number is this?</h2>
					{#if who.kind === 'UNKNOWN'}
						<p class="font-mono text-sm">
							{who.phone}{who.note ? ` · ${who.note}` : ''}
							<span class="ml-1 text-xs text-social">{UNKNOWN_LABEL}</span>
						</p>
						<blockquote class="border-l-4 border-l-line pl-3">
							“Hi — I got this number off the flyer for {mode === 'standing' ? residency?.eventName : occurrence?.eventName} at
							{data.venue.name}. Am I through to the right person about it? Who am I speaking to?”
						</blockquote>
						<div class="grid gap-2 sm:grid-cols-3">
							{#each [['promoter', 'A promoter', 'Add them, link the night, and the number moves to them.'], ['venue', data.venue.name, 'It becomes the venue’s number, unverified.'], ['neither', 'Neither', 'A ticket seller, a hostess line — the number stays on the night, and that’s fine.']] as [key, title, effect] (key)}
								<label class="cursor-pointer rounded-md border p-3 text-sm {ident === key ? 'border-social bg-ink' : 'border-line hover:border-dim'}">
									<input type="radio" name="ident" value={key} bind:group={ident} class="sr-only" />
									<span class="block font-semibold">{title}</span>
									<span class="text-xs text-dim">{effect}</span>
								</label>
							{/each}
						</div>
						{#if ident === 'promoter'}
							<OrganiserPicker name="ident" organisers={data.organisers} numberFrom={who.phone} placeholder="Who did you get? Search, or type their name" />
						{:else if ident === 'venue' && data.venue.phone && data.venue.phone !== who.phone}
							<p class="text-xs text-social">Replaces {data.venue.phone} as {data.venue.name}’s number.</p>
						{/if}
						<p class="text-xs text-dim">Only recorded if you reach someone. Nothing is attributed unless you pick it.</p>
					{:else}
						<p class="text-sm text-energy">The night selected has no flyer number. Pick the night whose number you rang.</p>
					{/if}
				</section>
			{/if}
			<blockquote class="panel border-l-4 border-l-line">
				“Hi, is this {dial === 'organiser' ? (organiser?.contactName ?? organiser?.name ?? '[name]') : dial === 'booking' ? '[name]' : (data.venue.contactName ?? '[name]')}? I’m {data.caller} from PartyWeya — we cover what’s happening
				around Kampala nightlife, and <strong>listings are free</strong>. I’m putting this week together and I want to get
				your details right. Two minutes?”
			</blockquote>

			<section class="panel space-y-4">
				<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">1–5</span>What’s on, when, what it costs, who’s playing</h2>
				<div class="flex flex-wrap gap-2 text-sm">
					{#each [['none', 'Nothing to log'], ['standing', 'Fix a standing night'], ['dated', 'Log a dated night']] as [key, text] (key)}
						<button
							type="button"
							class="rounded-md border px-3 py-2 {mode === key ? 'border-chill bg-chill/10' : 'border-line hover:border-dim'}"
							onclick={() => pick(key as typeof mode)}
						>
							{text}
						</button>
					{/each}
				</div>

				{#if mode === 'standing'}
					<p class="text-xs text-dim">Fixes the rule, so the gap closes every week rather than once.</p>
					{#if data.residencies.length === 0}
						<p class="text-sm text-social">No standing nights here. Log a dated night instead.</p>
					{:else}
						<label class="field">
							<span>Which standing night?</span>
							<select name="residencyId" bind:value={residencyId} class="input">
								{#each data.residencies as r (r.id)}
									<option value={r.id}>{DOW[r.dayOfWeek]} · {r.eventName} · {r.startTime ?? 'no time yet'}</option>
								{/each}
							</select>
						</label>
						{#key residencyId}
							<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
								<label class="field"><span>Starts</span><input name="s_start" class="input" placeholder="21:00" value={residency?.startTime ?? ''} /></label>
								<label class="field"><span>Wraps</span><input name="s_end" class="input" placeholder="02:00" value={residency?.endTime ?? ''} /></label>
								<label class="field"><span>At the gate</span><input name="s_gate" class="input" inputmode="numeric" placeholder="20000" value={residency?.priceGate ?? ''} /></label>
							</div>
							<div class="field"><span>The resident act — leave it as it is if it hasn’t changed</span>
								<LineupInput bind:this={lineupEl} name="s_lineup" value={residency?.lineup ?? []} bind:names={lineup} suggestions={data.suggestions} placeholder="The Clan Band" onresolved={() => formEl.requestSubmit()} />
							</div>
						<div class="space-y-2 border-t border-line pt-3">
							<p class="text-sm">“Anything on for drinks or food that night?”</p>
							<PerksEditor perks={residency?.perks ?? []} today={data.today} />
						</div>
						{/key}
					{/if}
				{:else if mode === 'dated'}
					<p class="text-xs text-dim">One night only, or this week different from the standing rule.</p>
					<label class="field">
						<span>Which night?</span>
						<select name="occurrenceId" bind:value={occurrenceId} class="input">
							<option value="new">A new dated night</option>
							{#each data.occurrences as o (o.id)}
								<option value={o.id}>{shortDate(o.date)} · {o.eventName} · {o.status.toLowerCase()}</option>
							{/each}
						</select>
					</label>
					{#if stillBlocked.length}
						<p class="rounded-md border border-social/50 bg-social/10 px-3 py-2 text-sm">
							<span class="mr-1 text-social">!</span>
							{#if stillBlocked.length === 1 && stillBlocked[0] === 'start time'}
								Already confirmed. <strong>The start time is the single field stopping it publishing</strong> — ask “what time does it start?”
							{:else}
								Already confirmed, but it can’t publish without: <strong>{stillBlocked.join(', ')}</strong>.
							{/if}
						</p>
					{/if}
					{#key occurrenceId}
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<label class="field"><span>Date</span><input name="d_date" type="date" class="input" value={occurrence?.date ?? ''} min={data.today} /></label>
							<label class="field col-span-2 sm:col-span-3"><span>Name</span><input name="d_name" class="input" value={occurrence?.eventName ?? ''} /></label>
							<label class="field"><span>Starts</span><input name="d_start" class="input" placeholder="21:00" value={occurrence?.startTime ?? ''} /></label>
							<label class="field"><span>Wraps</span><input name="d_end" class="input" placeholder="02:00" value={occurrence?.endTime ?? ''} /></label>
							<label class="field"><span>At the gate</span><input name="d_gate" class="input" inputmode="numeric" value={occurrence?.priceGate ?? ''} /></label>
							<label class="field"><span>In advance</span><input name="d_advance" class="input" inputmode="numeric" placeholder="—" value={occurrence?.priceAdvance ?? ''} /></label>
							<label class="field col-span-2"><span>Price tiers as advertised</span><input name="d_note" class="input" placeholder="165K PRE | 190K AT THE GATE" value={occurrence?.priceNote ?? ''} /></label>
							<label class="field"><span>Category</span>
								<select name="d_category" class="input" value={occurrence?.category ?? 'OTHER'}>
									{#each CATEGORIES as c (c)}<option value={c}>{label(c)}</option>{/each}
								</select>
							</label>
							<label class="field"><span>Register</span>
								<select name="d_register" class="input" value={occurrence?.register ?? registerFromQ6}>
									<option value="">not known</option>
									<option value="CHILL">Chill</option>
									<option value="SOCIAL">Social</option>
									<option value="HIGH_ENERGY">High-Energy</option>
								</select>
							</label>
							<div class="field col-span-2 sm:col-span-4"><span>Who’s playing — headliner first</span>
								<LineupInput bind:this={lineupEl} name="d_lineup" value={occurrence?.lineup ?? []} bind:names={lineup} suggestions={data.suggestions} placeholder="Named acts — the basis of a TRANSFERRED claim" onresolved={() => formEl.requestSubmit()} />
							</div>
						</div>
						<div class="space-y-2 border-t border-line pt-3">
							<p class="text-sm">“Anything on for drinks or food that night?”</p>
							<PerksEditor perks={occurrence?.perks ?? []} today={data.today} />
						</div>
					{/key}
				{/if}
			</section>

			{#if !venueOnLine}
				<p class="panel text-xs text-dim">
					<span class="mr-2 font-mono text-dim">6</span>Question 6 is about the room, so it’s asked of {data.venue.name}, not
					{dial === 'organiser' ? 'the organiser' : 'whoever this number turns out to be'}. This call won’t record an answer to it — or move
					{data.venue.name}’s next-call date.
				</p>
			{:else}
			<section class="panel space-y-3 border-chill/40 bg-chill/5">
				<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">6</span>The one that earns its place</h2>
				<p>“If I came through with friends and we wanted to actually talk — could we? Or is it full-volume?”</p>
				<div class="grid gap-2 sm:grid-cols-3">
					{#each Q6 as q (q.test)}
						<label
							class="cursor-pointer rounded-md border p-4 text-sm {q6 === q.test ? `${REGISTER_RING[q.register]} bg-ink` : 'border-line hover:border-dim'}"
						>
							<input type="radio" name="q6" value={q.test} bind:group={q6} class="sr-only" />
							<span class="block">{q.answer}</span>
							<span class="mt-1 block font-mono text-[11px] {REGISTER_TONE[q.register]}">→ {label(q.register)}</span>
						</label>
					{/each}
				</div>
				{#if q6}
					<button type="button" class="text-xs text-dim underline" onclick={() => (q6 = '')}>Not asked on this call</button>
				{/if}
				{#if !data.venue.conversationTest}
					<p class="text-xs text-chill">
						Never asked at this venue. Its register is currently guessed from the category — which is how the book reached
						zero Chill.
					</p>
				{/if}
				{#if q6 && data.residencies.length}
					<p class="text-xs text-dim">
						Saving reclasses {data.residencies.length === 1 ? 'its standing night' : `all ${data.residencies.length} standing nights here`}
						as {label(Q6.find((q) => q.test === q6)!.register)}.
					</p>
				{/if}
			</section>
			{/if}

			<section class="panel space-y-4">
				<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">7–8</span>What’s coming, and who to ask next time</h2>
				<label class="field">
					<span>“Anything coming up in the next few weeks I should know about?”</span>
					<textarea name="comingUp" rows="3" class="input" placeholder="Goes into the venue’s notes, dated. Log a dated night for anything firm."></textarea>
				</label>
				{#if mode !== 'none' && ident !== 'promoter'}
					<div class="field">
						<span>“Who’s the best person to call about this each time — you, or someone else?” Recording a promoter reroutes every future call about {mode === 'standing' ? 'this standing night' : 'this date'}.</span>
						{#key `${mode}-${residencyId}-${occurrenceId}`}
							<OrganiserPicker name="q8" organisers={data.organisers} value={ownOrganiser} placeholder="Someone else? Search organisers, or type a new name" />
						{/key}
					</div>
				{/if}
				{#if dial === 'venue'}
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_180px]">
					<label class="field"><span>Best person to call</span><input name="contactName" class="input" value={data.venue.contactName ?? ''} placeholder="—" /></label>
					<label class="field"><span>Their role</span>
						<select name="contactRole" class="input" value={data.venue.contactRole ?? ''}>
							<option value="">—</option>
							{#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
						</select>
					</label>
					<label class="field"><span>Number</span><input name="phone" type="tel" class="input" value={data.venue.phone ?? ''} placeholder="none on file" /></label>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 sm:items-center">
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" name="whatsapp" checked={data.venue.whatsapp} /> On WhatsApp — the reverse-flow channel
					</label>
					<input name="bestTime" class="input" value={data.venue.bestTimeToReach ?? ''} placeholder="Best time to reach them" />
				</div>
				{/if}
			</section>

			<blockquote class="panel border-l-4 border-l-line">
				“Great, I’ve got it. If anything changes — time, cover, cancellation — this number’s on WhatsApp, just send it
				through.”
			</blockquote>
		</main>

		<aside class="space-y-4">
			<section class="panel {data.reminders.some((r) => r.due && r.due < data.today) ? 'border-energy/50' : ''}">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="panel-title">You asked yourself to</h3>
					<span class="font-mono text-xs text-dim">{data.reminders.length || ''}</span>
				</div>
				<Reminders
					items={data.reminders}
					today={data.today}
					subject={{ kind: 'venue', id: data.venue.id, label: data.venue.name }}
					showSubject={data.reminders.some((r) => r.subject.kind !== 'venue')}
				/>
			</section>
			<section class="panel">
				<h3 class="panel-title mb-3">On file</h3>
				<dl class="space-y-1.5 font-mono text-xs">
					<div class="flex justify-between"><dt>Last called</dt><dd class={data.venue.lastContacted ? '' : 'text-social'}>{data.venue.lastContacted ? shortDate(data.venue.lastContacted) : 'never'}</dd></div>
					<div class="flex justify-between"><dt>Last attended</dt><dd class={data.venue.lastAttended ? '' : 'text-social'}>{data.venue.lastAttended ? shortDate(data.venue.lastAttended) : 'never'}</dd></div>
					<div class="flex justify-between"><dt>Clears F2</dt><dd class="text-dim">{data.venue.clearsF2 == null ? 'unknown' : data.venue.clearsF2 ? 'yes' : 'no'}</dd></div>
					<div class="flex justify-between"><dt>Register</dt>
						<dd class={data.venue.conversationTest ? REGISTER_TONE[data.venue.provisionalRegister ?? ''] : 'text-chill'}>
							{data.venue.conversationTest ? label(data.venue.provisionalRegister ?? '') : 'unclassed'}
						</dd>
					</div>
					<div class="flex justify-between"><dt>Paid client</dt><dd>{data.venue.paidClient ? 'yes' : 'no'}</dd></div>
				</dl>
			</section>

			{#if data.residencies.length}
				<section class="panel">
					<h3 class="panel-title mb-3">Standing nights</h3>
					<ul class="space-y-2">
						{#each data.residencies as r (r.id)}
							<li class="border-b border-line pb-2 last:border-0">
								<p class="text-sm">{r.eventName}</p>
								<p class="font-mono text-[11px] {r.startTime ? 'text-dim' : 'text-social'}">
									{DOW[r.dayOfWeek]} · {r.startTime ?? 'no time'} · {r.register}
								</p>
							</li>
						{/each}
					</ul>
					{#if sameRegister}
						<p class="mt-2 text-xs text-dim">
							{data.residencies.length} nights, one register between them. Question 6 reclasses all {data.residencies.length} at once.
						</p>
					{/if}
				</section>
			{/if}

			{#if data.occurrences.length}
				<section class="panel">
					<h3 class="panel-title mb-3">Coming up</h3>
					<ul class="space-y-1 font-mono text-[11px]">
						{#each data.occurrences as o (o.id)}
							<li class={o.status === 'CONFIRMED' ? '' : 'text-dim'}>{shortDate(o.date)} · {o.eventName} · {o.status.toLowerCase()}</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="panel">
				<h3 class="panel-title mb-2">Never say</h3>
				<ul class="list-disc space-y-1 pl-4 text-xs text-fg/80">
					<li>“We’ll feature you” — that’s a Rule F2 judgement, not a call.</li>
					<li>“Is it good?” — the answer is worthless and invites pressure.</li>
					<li>Any promise of coverage. The register records, it doesn’t queue.</li>
				</ul>
				<p class="mt-3 text-xs text-fg/80 italic">
					If they ask to be featured: “Listings are free — if the details check out, you’re in. The picks come from us
					actually turning up, and nobody can buy one.”
				</p>
			</section>
		</aside>
	</div>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}
			<p class="mb-2 text-sm text-energy">{form.error}</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			{#each [['reached', 'Reached them', 'border-vetted text-vetted'], ['no-answer', 'No answer', 'border-fg'], ['call-back', 'Call back', 'border-fg']] as [key, text, on] (key)}
				<label class="cursor-pointer rounded-md border px-3 py-2 {outcome === key ? on : 'border-line hover:border-dim'}">
					<input type="radio" name="outcome" value={key} bind:group={outcome} class="sr-only" required />{text}
				</label>
			{/each}
			<select name="cadence" class="input w-auto" bind:value={tier} onchange={() => (tierTouched = true)}>
				{#each CADENCE as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
			</select>
			{#if tierReason}<p class="max-w-52 text-[11px] leading-tight text-dim">{tierReason}</p>{/if}
			<span class="text-dim">Spoke to</span>
			<select name="source" class="input w-auto" value={defaultSource}>
				{#each SOURCES as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
			</select>
			{#if derivedClaim}
				<span class="font-mono text-xs text-dim" title="Derived from the source and the lineup — not chosen">
					→ <span class={derivedClaim === 'TRANSFERRED' ? 'text-vetted' : 'text-fg'}>{derivedClaim}</span>
				</span>
			{/if}
			<p class="hidden max-w-56 text-xs text-dim 2xl:block">
				{outcome && outcome !== 'reached'
					? 'Only contact details and the next-call date save without reaching them.'
					: 'The claim follows the lineup. Doubt an act? Leave them off it.'}
			</p>
			<button class="btn-primary ml-auto" disabled={saving}>{saving ? 'Saving…' : 'Save call'}</button>
		</div>
	</footer>
</form>
