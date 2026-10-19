<script lang="ts">
	import { enhance } from '$app/forms';
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
	let lineup = $state('');
	let claimType = $state('FACTUAL');
	let saving = $state(false);
	let formEl: HTMLFormElement;

	const residency = $derived(data.residencies.find((r) => r.id === residencyId));
	const occurrence = $derived(data.occurrences.find((o) => o.id === occurrenceId));
	const transferredOk = $derived(mode === 'dated' && lineup.trim().length > 0);
	$effect(() => {
		if (!transferredOk && claimType === 'TRANSFERRED') claimType = 'FACTUAL';
	});
	$effect(() => {
		lineup = occurrence?.lineup ?? '';
	});

	const sameRegister = $derived(
		data.residencies.length > 1 && new Set(data.residencies.map((r) => r.register)).size === 1
	);
	const defaultSource = $derived(
		({ OWNER: 'OWNER', PROMOTER: 'PROMOTER', MANAGER: 'MANAGER', MARKETING: 'MANAGER', HOST: 'MANAGER' } as Record<string, string>)[
			data.venue.contactRole ?? ''
		] ?? 'OWNER'
	);
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
	use:enhance={() => {
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

	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div>
			<a href="/calls?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Call round</a>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight">{data.venue.name}</h1>
			<p class="font-mono text-xs text-dim">
				{[data.venue.zone ?? 'NO ZONE', data.venue.division, data.venue.location].filter(Boolean).join(' · ')}
			</p>
		</div>
		<div class="flex items-center gap-4">
			<a href="/add?venue={data.venue.id}" class="btn text-sm" title="Something that doesn’t fit this call">+ Add to the register</a>
			<p class="text-right font-mono text-xs text-dim">logging as {data.caller}<br />⌘↵ to save</p>
		</div>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			<blockquote class="panel border-l-4 border-l-line">
				“Hi, is this {data.venue.contactName ?? '[name]'}? I’m {data.caller} from PartyWeya — we cover what’s happening
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
							onclick={() => (mode = key as typeof mode)}
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
							<label class="field col-span-2 sm:col-span-4"><span>Who’s playing</span><input name="d_lineup" class="input" bind:value={lineup} placeholder="Named acts — the basis of a TRANSFERRED claim" /></label>
						</div>
					{/key}
				{/if}
			</section>

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

			<section class="panel space-y-4">
				<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">7–8</span>What’s coming, and who to ask next time</h2>
				<label class="field">
					<span>“Anything coming up in the next few weeks I should know about?”</span>
					<textarea name="comingUp" rows="3" class="input" placeholder="Goes into the venue’s notes, dated. Log a dated night for anything firm."></textarea>
				</label>
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
			</section>

			<blockquote class="panel border-l-4 border-l-line">
				“Great, I’ve got it. If anything changes — time, cover, cancellation — this number’s on WhatsApp, just send it
				through.”
			</blockquote>
		</main>

		<aside class="space-y-4">
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
			<select name="cadence" class="input w-auto">
				{#each CADENCE as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
			</select>
			<span class="text-dim">Spoke to</span>
			<select name="source" class="input w-auto" value={defaultSource}>
				{#each SOURCES as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
			</select>
			<span class="text-dim">Claim</span>
			<select name="claimType" class="input w-auto" bind:value={claimType}>
				<option value="FACTUAL">FACTUAL — it is happening</option>
				<option value="TRANSFERRED" disabled={!transferredOk}>TRANSFERRED — a known act</option>
			</select>
			<p class="hidden max-w-56 text-xs text-dim 2xl:block">
				{outcome && outcome !== 'reached'
					? 'Only contact details and the next-call date save without reaching them.'
					: 'TRANSFERRED unlocks once a lineup is entered. VETTED is not offered.'}
			</p>
			<button class="btn-primary ml-auto" disabled={saving}>{saving ? 'Saving…' : 'Save call'}</button>
		</div>
	</footer>
</form>
