<script lang="ts">
	// The write-up: what comes back from the weekly attendance. Filled on a phone,
	// that night or the next morning — single column, the sentence near the top.
	// The only screen that can write a VETTED claim; it writes no publication.
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { DAYS } from '#lib/build/add.js';
	import { dayHeading, shillings } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const n = $derived(data.night);

	const REGISTERS = [
		['CHILL', 'Chill', 'border-chill text-chill'],
		['SOCIAL', 'Social', 'border-social text-social'],
		['HIGH_ENERGY', 'High-Energy', 'border-energy text-energy']
	] as const;
	const LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
	const ANSWER: Record<string, string> = {
		CAN_TALK: '“yeah, it’s relaxed”',
		ONLY_AT_THE_EDGES: '“early on yes, later it gets going”',
		NO: '“no chance, it’s loud”'
	};

	// svelte-ignore state_referenced_locally — seeds the form once.
	let date = $state(data.night.date);
	let arrived = $state('');
	let left = $state('');
	let clears = $state('');
	let register = $state('');
	let observed = $state(''); // optional: the room's own answer to the conversation test
	let nothingDiffered = $state(false);
	// svelte-ignore state_referenced_locally
	let actualStart = $state(data.night.said.start ?? '');
	// svelte-ignore state_referenced_locally
	let actualPrice = $state(data.night.said.price == null ? '' : String(data.night.said.price));
	// svelte-ignore state_referenced_locally
	let actualLineup = $state(data.night.said.lineup.join(', '));
	let saving = $state(false);
	const future = $derived(n.kind === 'occurrence' && n.date > data.today);

	// ── The window you were there, against the night's own hours ──
	const mins = (t: string) => {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + m;
	};
	// Evening-relative minutes: anything before noon is after midnight.
	const night = (t: string) => (mins(t) < 12 * 60 ? mins(t) + 24 * 60 : mins(t));
	const opens = $derived(n.said.start ? night(n.said.start) : 21 * 60);
	const closes = $derived(n.said.end ? night(n.said.end) : 26 * 60); // unknown close: read to 02:00
	const valid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
	const there = $derived(valid(arrived) && valid(left) && night(left) > night(arrived) ? { from: night(arrived), to: night(left) } : null);
	const pct = (m: number) => Math.max(0, Math.min(100, ((m - opens) / Math.max(1, closes - opens)) * 100));
	const span = $derived(there ? `${Math.floor((there.to - there.from) / 60)}h${String((there.to - there.from) % 60).padStart(2, '0')}` : '');
	// The whole Chill / Social distinction lives after midnight.
	const leftEarly = $derived(valid(left) && night(left) < 24 * 60);

	// ── What the register said, and what was true ──
	const differs = $derived({
		start: !!actualStart && actualStart !== (n.said.start ?? ''),
		price: actualPrice !== '' && Number(actualPrice.replace(/[,\s]/g, '')) !== n.said.price,
		lineup: actualLineup.trim() !== '' && actualLineup.split(/[,;]/).map((s) => s.trim().toLowerCase()).join('|') !== n.said.lineup.map((s) => s.toLowerCase()).join('|')
	});
</script>

<svelte:head><title>Write-up · {n.eventName}</title></svelte:head>

{#snippet card(num: string, title: string)}
	<p class="font-mono text-[10px] tracking-[0.15em] text-dim uppercase">{num} · {title}</p>
{/snippet}

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="min-h-screen bg-ink pb-28 text-fg"
>
	<header class="flex items-center gap-4 border-b border-line px-4 py-4 sm:px-6">
		<HomeLogo week={data.currentWeek} />
		<div class="min-w-0">
			<a href={n.record} class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← {n.eventName}</a>
			<h1 class="text-xl font-semibold tracking-tight">The write-up</h1>
		</div>
	</header>

	<main class="mx-auto max-w-xl space-y-3 px-4 py-4">
		<!-- The night: read from the register, never typed. -->
		<section class="rounded-md border border-line border-l-4 border-l-vetted bg-panel p-3">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="font-semibold">{n.venue.name}</p>
					<p class="text-sm text-dim">{n.eventName}</p>
				</div>
				<p class="shrink-0 text-right font-mono text-[11px] text-dim">
					{n.kind === 'residency' ? `every ${DAYS[n.dayOfWeek ?? 0].slice(0, 3)}` : dayHeading(n.date)} · {n.said.start ?? 'no time'}<br />{n.venue.zone ?? 'NO ZONE'}
				</p>
			</div>
			{#if n.attendedAt}<p class="mt-1 text-xs text-dim">Last vouched {dayHeading(n.attendedAt).toLowerCase()}{n.attendedBy ? ` by ${n.attendedBy}` : ''}.</p>{/if}
		</section>

		{#if future}
			<p class="rounded-md border border-energy/50 bg-energy/10 px-3 py-2 text-sm">This night is on {dayHeading(n.date).toLowerCase()} — it can’t be written up before it happens.</p>
		{/if}

		<!-- 1 · When you were actually there -->
		<section class="panel space-y-2">
			{@render card('1', 'When you were actually there')}
			<label class="field">
				<span>Date attended</span>
				{#if n.kind === 'residency'}
					<input name="date" type="date" class="input h-11" bind:value={date} max={data.today} required />
				{:else}
					<input type="date" class="input h-11" value={n.date} disabled /><input type="hidden" name="date" value={n.date} />
				{/if}
			</label>
			<div class="grid grid-cols-2 gap-2">
				<label class="field"><span>Arrived</span><input name="arrivedAt" type="time" class="input h-11" bind:value={arrived} /></label>
				<label class="field"><span>Left</span><input name="leftAt" type="time" class="input h-11" bind:value={left} /></label>
			</div>
			<div class="relative mt-1 h-2 rounded bg-line" aria-hidden="true">
				{#if there}<div class="absolute inset-y-0 rounded bg-vetted/70" style="left: {pct(there.from)}%; width: {pct(there.to) - pct(there.from)}%"></div>{/if}
			</div>
			<p class="flex justify-between font-mono text-[10px] text-dim">
				<span>{n.said.start ?? '21:00?'} opens</span>{#if there}<span class="text-vetted">there {span}</span>{/if}<span>{n.said.end ?? '02:00?'} close</span>
			</p>
			{#if leftEarly}
				<p class="rounded-md border border-social/60 bg-social/10 px-3 py-2 text-xs">
					Left before midnight — this window can’t support a Chill or Social call. “Early on yes, later it gets going” is only confirmed or overturned after eleven.
				</p>
			{/if}
			<p class="text-[11px] text-dim">The date starts Rule F5’s 4–6 week vouch clock. A day out here is a vouch that expires on the wrong Sunday.</p>
		</section>

		<!-- 2 · The verdict. No default; "doesn't clear" costs exactly what "clears" costs. -->
		<section class="panel space-y-2">
			{@render card('2', 'The verdict — Rule F2, the quality gate')}
			<div class="grid grid-cols-2 gap-2">
				{#each [['yes', 'Clears the gate', 'border-vetted bg-vetted/10 text-vetted'], ['no', 'Doesn’t clear', 'border-energy bg-energy/10 text-energy']] as [key, label, on] (key)}
					<label class="flex h-12 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold {clears === key ? on : 'border-line hover:border-dim'}">
						<input type="radio" name="clears" value={key} bind:group={clears} class="sr-only" required />{label}
					</label>
				{/each}
			</div>
			<p class="text-[11px] text-dim">The only thing that can make this night pickable. A “doesn’t clear” stops it being picked — a result, not a wasted trip.</p>
		</section>

		<!-- 3 · The register, judged from the room — beside what we predicted. -->
		<section class="panel space-y-2">
			{@render card('3', 'The register, judged from the room')}
			<div class="grid grid-cols-3 gap-2">
				{#each REGISTERS as [key, label, on] (key)}
					<label class="flex h-12 cursor-pointer items-center justify-center rounded-md border text-sm {register === key ? `${on} bg-ink font-semibold` : 'border-line hover:border-dim'}">
						<input type="radio" name="register" value={key} bind:group={register} class="sr-only" required />{label}
					</label>
				{/each}
			</div>
			<div class="rounded-md border border-dashed border-social/50 px-3 py-2 text-xs">
				{#if n.predicted.register}
					<p class="font-mono text-[10px] tracking-wider text-social uppercase">We predicted {LABEL[n.predicted.register]}</p>
					<p class="text-fg/80">
						From question 6{n.predicted.at ? ` on ${dayHeading(n.predicted.at).toLowerCase()}` : ''}{n.predicted.from ? ` — ${ANSWER[n.predicted.from]}` : ''}.
					</p>
				{:else}
					<p class="text-dim">No prediction — question 6 was never asked here. This visit is the first word on the room.</p>
				{/if}
			</div>
			<!-- Optional, one tap, never blocks a save. It says WHICH way a missed prediction missed:
			     the mapping table, or the venue's description of itself. Tap again to clear. -->
			<div class="space-y-1">
				<p class="text-xs text-dim">Optional — could you actually talk in there? <span class="text-fg/60">(tap again to clear)</span></p>
				<input type="hidden" name="observed" value={observed} />
				<div class="grid grid-cols-3 gap-2">
					{#each [['CAN_TALK', 'Could talk'], ['ONLY_AT_THE_EDGES', 'Only at the edges'], ['NO', 'No chance']] as [key, label] (key)}
						<button
							type="button"
							class="h-10 rounded-md border text-xs {observed === key ? 'border-fg bg-ink font-semibold' : 'border-line text-dim hover:border-dim'}"
							aria-pressed={observed === key}
							onclick={() => (observed = observed === key ? '' : key)}>{label}</button
						>
					{/each}
				</div>
			</div>
		</section>

		<!-- 4 · The sentence: written tonight, not reconstructed in eight days. -->
		<section class="panel space-y-2">
			{@render card('4', 'The sentence — Rule F1, shareability')}
			<textarea name="vettedNote" rows="3" class="input py-2" placeholder="Loudest courtyard in Kololo all week, and the band actually ends at 1."></textarea>
			<p class="text-[11px] text-dim">In eight days this is reconstructed from memory — the quiet way a vetted entry becomes a factual one wearing the wrong label.</p>
		</section>

		<!-- 5 · What the register said, and what was true. Catches the exception. -->
		<section class="panel space-y-2">
			{@render card('5', 'What the register said, and what was true')}
			<label class="flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm {nothingDiffered ? 'border-vetted text-vetted' : 'border-line'}">
				<input type="checkbox" name="nothingDiffered" class="size-5" bind:checked={nothingDiffered} /> Nothing differed
			</label>
			{#if !nothingDiffered}
				{#snippet fact(label: string, said: string, name: string, value: string, set: (v: string) => void, differ: boolean, correctName: string, inputmode: 'text' | 'numeric' = 'text')}
					<div class="space-y-1">
						<div class="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-sm">
							<span class="font-mono text-[11px] text-dim">{label}<br /><span class="text-fg/70">said {said}</span></span>
							<input {name} class="input h-10 {differ ? 'border-social' : ''}" {inputmode} {value} oninput={(e) => set(e.currentTarget.value)} />
						</div>
						{#if differ}
							<label class="ml-[96px] flex items-center gap-2 text-xs text-social"><input type="checkbox" name={correctName} class="size-4" /> correct the register too</label>
						{/if}
					</div>
				{/snippet}
				{@render fact('start', n.said.start ?? '—', 'actualStartTime', actualStart, (v) => (actualStart = v), differs.start, 'correctStart')}
				{@render fact('gate', n.said.price == null ? '—' : shillings(n.said.price), 'actualPrice', actualPrice, (v) => (actualPrice = v), differs.price, 'correctPrice', 'numeric')}
				{@render fact('lineup', n.said.lineup.join(', ') || '—', 'actualLineup', actualLineup, (v) => (actualLineup = v), differs.lineup, 'correctLineup')}
				<p class="text-[11px] text-dim">Kept as a plain line on the venue — “said 21:30, opened 23:00” — so the next caller can raise it. Nothing changes in the register unless you tick it.</p>
			{/if}
		</section>

		<!-- 6 · Nights seen that aren't in the register: flyer-grade, so the next call confirms them. -->
		<section class="panel space-y-2">
			{@render card('6', 'Nights you saw that aren’t in the register')}
			<textarea name="leads" rows="2" class="input py-2" placeholder="Poster: Tuesday quiz, 8pm, free entry"></textarea>
			<p class="text-[11px] text-dim">One per line. Each reaches the next call to this venue as a reminder — the call turns it into a row.</p>
		</section>

		<!-- 7 · What it cost: the one recurring cost the free system carries. -->
		<section class="panel space-y-2">
			{@render card('7', 'What it cost')}
			<div class="grid grid-cols-3 gap-2">
				<label class="field"><span>Entry</span><input name="costEntry" class="input h-10" inputmode="numeric" /></label>
				<label class="field"><span>Transport</span><input name="costTransport" class="input h-10" inputmode="numeric" /></label>
				<label class="field"><span>Spend</span><input name="costSpend" class="input h-10" inputmode="numeric" /></label>
			</div>
		</section>

		<section class="panel">
			<label class="field"><span>Your initials — who stood in the room</span>
				<input name="initials" class="input h-11 w-32 font-mono uppercase" autocomplete="off" placeholder="RM" required />
			</label>
		</section>
	</main>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur">
		<div class="mx-auto max-w-xl">
			{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
			<button class="btn-primary h-12 w-full" disabled={saving || future}>{saving ? 'Saving…' : 'Record the visit'}</button>
			<p class="mt-1 text-center text-[11px] text-dim">Writes the vouch and the verdict. No publication — that’s the Sunday Build’s call.</p>
		</div>
	</footer>
</form>
