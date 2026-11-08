<script lang="ts">
	// The round-up brief: kept open beside Canva while making the carousel.
	// Copy buttons, not a document — retyping is where a permanent mistake gets in.
	// Facts come from the register; the one line per entry is typed here and
	// nowhere else. Nothing on this screen edits the register.
	import { deserialize } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { dayHeading, shortDate } from '#lib/build/week.js';
	import {
		LOCKED_TAGS,
		REGISTERS,
		REGISTER_LABEL,
		blockText,
		captionText,
		cleanTag,
		coverText,
		missingMoods,
		nights,
		placeTagClash,
		proposeTikTok,
		tiktokText,
		zoneLabel
	} from '#lib/build/roundup.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Entry = Extract<typeof data, { blocked: false }>['entries'][number];

	// svelte-ignore state_referenced_locally
	const open = data.blocked ? null : data;
	let entries = $state<Entry[]>(open ? [...open.entries] : []);
	let lines = $state<Record<string, string>>(Object.fromEntries((open?.entries ?? []).map((e) => [e.key, e.line])));
	let lineState = $state<Record<string, 'saving' | 'saved' | 'error'>>({});
	let error = $state<string | null>(null);

	async function post(action: string, fill: (f: FormData) => void) {
		const f = new FormData();
		f.set('week', data.week);
		fill(f);
		const res = await fetch(`?/${action}`, { method: 'POST', body: f, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } });
		const result = deserialize(await res.text());
		if (result.type === 'failure') error = String(result.data?.error ?? 'Not saved.');
		else if (result.type === 'error') error = 'The save failed. Nothing was written.';
		else error = null;
		return result.type === 'success' ? result : null;
	}

	// ── Lines: saved as typed, so a reload loses nothing ──
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function typed(key: string) {
		lineState[key] = 'saving';
		clearTimeout(timers[key]);
		timers[key] = setTimeout(async () => {
			const ok = await post('line', (f) => (f.set('key', key), f.set('line', lines[key] ?? '')));
			lineState[key] = ok ? 'saved' : 'error';
		}, 600);
	}

	// ── Order: a decision, not a sort. Within a night; slide numbers run across the set ──
	const grouped = $derived(nights(entries));
	const slide = (key: string) => entries.findIndex((e) => e.key === key) + 1;
	async function saveOrder() {
		await post('order', (f) => entries.forEach((e) => f.append('key', e.key)));
	}
	function moveTo(key: string, beforeKey: string | null, date: string) {
		const from = entries.findIndex((e) => e.key === key);
		if (from < 0 || entries[from].date !== date) return; // a night's entries stay on their night
		const [moved] = entries.splice(from, 1);
		const at = beforeKey ? entries.findIndex((e) => e.key === beforeKey) : entries.findLastIndex((e) => e.date === date) + 1;
		entries.splice(at, 0, moved);
		saveOrder();
	}
	function nudge(key: string, by: -1 | 1) {
		const i = entries.findIndex((e) => e.key === key);
		const j = i + by;
		if (j < 0 || j >= entries.length || entries[j].date !== entries[i].date) return;
		[entries[i], entries[j]] = [entries[j], entries[i]];
		saveOrder();
	}
	let dragging = $state<string | null>(null);

	// ── Copy ──
	let copied = $state<string | null>(null);
	async function copy(id: string, text: string) {
		await navigator.clipboard.writeText(text);
		copied = id;
		setTimeout(() => copied === id && (copied = null), 1500);
	}

	// ── Caption ──
	let intro = $state(open?.intro ?? '');
	let pointer = $state(open?.pointer ?? '');
	let tags = $state<string[]>([...(open?.tags ?? [])]);
	let captionState = $state<'saving' | 'saved' | null>(null);
	let captionTimer: ReturnType<typeof setTimeout>;
	function captionTyped() {
		captionState = 'saving';
		clearTimeout(captionTimer);
		captionTimer = setTimeout(async () => {
			const ok = await post('caption', (f) => (f.set('intro', intro), f.set('pointer', pointer), tags.forEach((t) => f.append('tag', t))));
			captionState = ok ? 'saved' : null;
		}, 600);
	}
	const places = $derived([...new Set(entries.flatMap((e) => [e.venue, e.zone ?? '']).filter(Boolean))]);
	const moodsMissing = $derived(missingMoods(pointer));

	// ── TikTok: one per register, proposed, then yours ──
	const proposal = $derived(proposeTikTok(entries));
	// svelte-ignore state_referenced_locally
	let picks = $state<Record<string, string>>(
		Object.fromEntries(
			REGISTERS.map((r) => {
				const saved = open?.tiktok.find((k) => open.entries.some((e) => e.key === k && e.register === r));
				return [r, saved ?? proposeTikTok(open?.entries ?? [])[r] ?? ''];
			})
		)
	);
	const pickedEntries = $derived(REGISTERS.map((r) => entries.find((e) => e.key === picks[r])).filter((e): e is Entry => !!e));
	async function savePicks() {
		await post('tiktok', (f) => REGISTERS.forEach((r) => picks[r] && f.append('key', picks[r])));
	}

	// ── Published: after it is actually up ──
	let confirming = $state(false);
	let publishing = $state(false);
	let justPublished = $state(false);
	const unlined = $derived(entries.filter((e) => !(lines[e.key] ?? '').trim()).length);
	async function published() {
		publishing = true;
		const ok = await post('published', () => {});
		publishing = false;
		confirming = false;
		if (ok) {
			justPublished = true;
			entries = entries.map((e) => ({ ...e, published: e.published + 1 }));
		}
	}

	const REGISTER_TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };
</script>

<svelte:head><title>Round-up · week of {shortDate(data.week)}</title></svelte:head>

{#snippet copyButton(id: string, text: string, label = 'copy')}
	<button type="button" class="btn h-9 shrink-0 px-3 text-xs {copied === id ? 'border-vetted text-vetted' : ''}" onclick={() => copy(id, text)}>
		{copied === id ? 'copied ✓' : label}
	</button>
{/snippet}

<div class="min-h-screen bg-ink pb-16 text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/build?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Sunday build</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Round-up — week of Mon {shortDate(data.week)}</h1>
				{#if !data.blocked}
					<p class="text-sm text-dim">Facts from the register; the line is yours. Copy each block into Canva — don’t retype.</p>
				{/if}
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm"><ThisWeek /></nav>
	</header>

	{#if data.blocked}
		<!-- The gate is not advisory. -->
		<div class="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6">
			<p class="text-lg">The Sunday gate hasn’t passed for this week — {data.gate.passed} of {data.gate.total}.</p>
			<ul class="space-y-3">
				{#each data.failed as c (c.label)}
					<li class="rounded-md border border-energy/50 bg-energy/5 px-4 py-3 text-sm">
						<p class="font-semibold text-energy">✕ {c.label}</p>
						<p class="text-fg/80">{c.detail}</p>
					</li>
				{/each}
			</ul>
			<a href="/build?week={data.week}" class="btn inline-flex h-11 items-center">← Back to the Sunday Build</a>
		</div>
	{:else}
		{#if error}<p class="mx-4 mt-4 rounded-md border border-energy/50 bg-energy/10 px-4 py-2 text-sm text-energy sm:mx-6">{error}</p>{/if}

		<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
			<main class="min-w-0 space-y-6">
				<!-- Cover: the count that actually cleared, reported after the gate. -->
				<section class="panel flex items-center justify-between gap-3">
					<div>
						<p class="font-mono text-[10px] tracking-wider text-dim uppercase">Cover</p>
						<p class="text-lg font-semibold">{coverText(entries.length, data.week)}</p>
					</div>
					{@render copyButton('cover', coverText(entries.length, data.week))}
				</section>

				{#each grouped as night (night.date)}
					<section>
						<h2 class="mb-2 flex items-center gap-3 font-mono text-xs tracking-wider text-dim uppercase">
							{dayHeading(night.date)}<span class="h-px flex-1 bg-line"></span><span>{night.entries.length}</span>
						</h2>
						<div class="space-y-2">
							{#each night.entries as e, i (e.key)}
								<article
									class="rounded-md border bg-panel p-3 {dragging === e.key ? 'opacity-40' : ''} {e.paidClient ? 'border-social/70' : 'border-line'}"
									draggable="true"
									ondragstart={(ev) => ((dragging = e.key), ev.dataTransfer?.setData('text/plain', e.key))}
									ondragend={() => (dragging = null)}
									ondragover={(ev) => {
										const d = entries.find((x) => x.key === dragging);
										if (d && d.date === e.date && d.key !== e.key) ev.preventDefault();
									}}
									ondrop={(ev) => {
										ev.preventDefault();
										if (dragging) moveTo(dragging, e.key, e.date);
										dragging = null;
									}}
									aria-label="Slide {slide(e.key)}: {e.eventName}"
								>
									<div class="flex items-start gap-3">
										<div class="flex w-8 shrink-0 flex-col items-center gap-0.5 pt-0.5 font-mono text-[11px] text-dim">
											<span class="cursor-grab select-none" title="Drag within the night">⠿</span>
											<span>#{slide(e.key)}</span>
											<button type="button" class="hover:text-fg disabled:opacity-20" disabled={i === 0} onclick={() => nudge(e.key, -1)} aria-label="Move up">↑</button>
											<button type="button" class="hover:text-fg disabled:opacity-20" disabled={i === night.entries.length - 1} onclick={() => nudge(e.key, 1)} aria-label="Move down">↓</button>
										</div>
										<div class="min-w-0 flex-1 space-y-1">
											<div class="flex items-start justify-between gap-2">
												<div class="min-w-0">
													{#if e.paidClient}
														<p class="mb-1 inline-block rounded border border-social/60 px-1.5 font-mono text-[10px] tracking-wider text-social" title="Item one is seen ~22× more than the last — place a paying client on purpose">
															PAID CLIENT · place deliberately
														</p>
													{/if}
													<p class="font-semibold">{e.eventName}</p>
													<p class="text-sm">{e.venue}{e.zone ? ` · ${zoneLabel(e.zone)}` : ''}</p>
													<p class="font-mono text-xs">
														{e.startTime}{e.price ? ` · ${e.price}` : ''} · <span class={REGISTER_TONE[e.register]}>{REGISTER_LABEL[e.register]}</span>
													</p>
													{#if e.perk}<p class="text-xs text-vetted/90">{e.perk}</p>{/if}
													{#if e.clearsF2 === false}<p class="font-mono text-[10px] tracking-wider text-energy" title="Judged in the room: doesn’t clear Rule F2">DOESN’T CLEAR · listing only — never a pick</p>{/if}
												</div>
												{@render copyButton(e.key, blockText(e, lines[e.key] ?? ''))}
											</div>
											<!-- The only thing typed here. Never suggested, never templated (Rule F2). -->
											<input
												class="input h-10 w-full text-sm"
												placeholder="your line"
												bind:value={lines[e.key]}
												oninput={() => typed(e.key)}
												aria-label="Your line for {e.eventName}"
											/>
											<p class="flex flex-wrap gap-x-3 font-mono text-[10px] text-dim">
												<span class={lineState[e.key] === 'error' ? 'text-energy' : ''}>
													{lineState[e.key] === 'saving' ? 'saving…' : lineState[e.key] === 'saved' ? 'saved ✓' : lineState[e.key] === 'error' ? 'not saved' : ''}
												</span>
												<span title="Venue, zone and category tags, for the carousel cuts later in the week">tags for later cuts: none — no Tag Vocabulary in the register yet</span>
												{#if e.published}<span class="text-vetted">in {e.published} round-up{e.published === 1 ? '' : 's'} already</span>{/if}
											</p>
										</div>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</main>

			<aside class="space-y-4">
				<!-- Caption: intro, the Rule F6 pointer, then ten tags. -->
				<section class="panel space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="panel-title">Caption</h3>
						<span class="flex items-center gap-2">
							<span class="font-mono text-[10px] text-dim">{captionState === 'saving' ? 'saving…' : captionState === 'saved' ? 'saved ✓' : ''}</span>
							{@render copyButton('caption', captionText(intro, pointer, tags), 'copy all')}
						</span>
					</div>
					<label class="field"><span>Intro</span><textarea class="input min-h-20 py-2 text-sm" bind:value={intro} oninput={captionTyped}></textarea></label>
					<label class="field">
						<span>Pointer <span class="font-normal normal-case text-dim">— Rule F6: names all three moods</span></span>
						<input class="input h-10 text-sm" bind:value={pointer} oninput={captionTyped} />
					</label>
					{#if pointer.trim() && moodsMissing.length}
						<p class="text-xs text-social">Doesn’t name {moodsMissing.map((m) => REGISTER_LABEL[m]).join(' or ')} yet.</p>
					{/if}
					<div class="space-y-1.5">
						<p class="font-mono text-[10px] tracking-wider text-dim uppercase">Tags — 3 locked, 7 yours</p>
						<div class="flex flex-wrap gap-1.5">
							{#each LOCKED_TAGS as t (t)}
								<!-- Not a field: a locked tag can't be edited or hand-typed. -->
								<span class="rounded border border-line bg-ink px-2 py-1 font-mono text-xs" title="Locked — part of the archive">🔒 {t}</span>
							{/each}
						</div>
						{#each tags as _, i (i)}
							{@const clash = placeTagClash(tags[i], places)}
							<input
								class="input h-9 w-full font-mono text-xs {clash ? 'border-energy' : ''}"
								placeholder={i >= 4 ? 'angle tag' : ''}
								bind:value={tags[i]}
								oninput={captionTyped}
								onblur={() => ((tags[i] = cleanTag(tags[i])), captionTyped())}
								aria-label="Tag slot {i + 4}"
							/>
							{#if clash}<p class="text-[11px] text-energy">That reads as {clash}’s tag. Venue and zone tags belong to the carousel cuts, not a round-up’s ten.</p>{/if}
						{/each}
					</div>
				</section>

				<!-- TikTok: a reduced cut, pointing at the carousel. -->
				<section class="panel space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="panel-title">TikTok cut</h3>
						{@render copyButton('tiktok', tiktokText(pickedEntries, entries.length))}
					</div>
					<p class="text-xs text-dim">One per mood — proposed by claim strength, then by your order. Change any.</p>
					{#each REGISTERS as r (r)}
						<label class="field">
							<span class={REGISTER_TONE[r]}>{REGISTER_LABEL[r]}{picks[r] && picks[r] === proposal[r] ? ' · proposed' : ''}</span>
							<select class="input h-10 text-sm" bind:value={picks[r]} onchange={savePicks}>
								<option value="">— none —</option>
								{#each entries.filter((e) => e.register === r) as e (e.key)}
									<option value={e.key}>{e.eventName} · {e.venue} · {dayHeading(e.date)}</option>
								{/each}
							</select>
						</label>
					{/each}
				</section>

				<!-- Published: a separate, later action. Building is not publishing. -->
				<section class="panel space-y-3">
					<h3 class="panel-title">Published</h3>
					{#if open?.published.length}
						<p class="text-xs text-dim">Marked published {open.published.length}× before — {open.published.map((p) => shortDate(p.slice(0, 10))).join(', ')}. Again records a second appearance.</p>
					{/if}
					{#if justPublished}
						<p class="rounded-md border border-vetted/60 bg-vetted/10 px-3 py-2 text-sm">
							Logged: {entries.length} entries, one Publication row each. <strong>Pin the post now</strong> — this week’s later reminders point back to it.
						</p>
					{:else if confirming}
						<p class="text-sm">Is it actually up? This writes {entries.length} Publication rows{unlined ? ` — ${unlined} with no line` : ''}.</p>
						<div class="flex gap-2">
							<button type="button" class="btn h-10" onclick={() => (confirming = false)}>Not yet</button>
							<button type="button" class="btn-primary h-10" disabled={publishing} onclick={published}>{publishing ? 'Logging…' : 'Yes — it’s up'}</button>
						</div>
					{:else}
						<button type="button" class="btn h-11 w-full" onclick={() => (confirming = true)}>Mark as published</button>
						<p class="text-[11px] text-dim">Only after the post is live. Nothing is recorded by opening or building this.</p>
					{/if}
				</section>
			</aside>
		</div>
	{/if}
</div>
