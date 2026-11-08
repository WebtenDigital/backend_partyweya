<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import Visits from '#lib/components/Visits.svelte';
	import NewActsPrompt from '#lib/components/NewActsPrompt.svelte';
	import Reminders from '#lib/components/Reminders.svelte';
	import { enhance } from '$app/forms';
	import { GROUPS, SORT_COOKIE, rowDate, type GroupKey, type QueueRow } from '#lib/build/calls.js';
	import { UNKNOWN_LABEL } from '#lib/build/who.js';
	import { addDays, daysBetween, shortDate } from '#lib/build/week.js';
	import { reminderAction } from '#lib/reminders.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let phoneErrors = $state<Record<string, string>>({});

	// By type is the default and today's order; by date flattens it. Remembered in a
	// cookie the server reads, so a reload opens the way you left it.
	// svelte-ignore state_referenced_locally
	let sort = $state(data.sort);
	function setSort(to: 'type' | 'date') {
		sort = to;
		document.cookie = `${SORT_COOKIE}=${to}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
	}
	const withWeek = (href: string) => `${href}${href.includes('?') ? '&' : '?'}week=${data.week}`;

	const EDGE: Record<GroupKey, string> = {
		'this-week': 'border-l-energy',
		'every-week': 'border-l-social',
		due: 'border-l-fg',
		sweep: 'border-l-dim',
		unclassified: 'border-l-chill'
	};
	const TONE: Record<GroupKey, string> = {
		'this-week': 'text-energy',
		'every-week': 'text-social',
		due: 'text-fg',
		sweep: 'text-dim',
		unclassified: 'text-chill'
	};
	const WHY: Record<GroupKey, string> = {
		'this-week': 'Tier C: a night here has never been confirmed — any standing night, which blocks every window, or a dated row inside this one. Also a standing night the Sunday Build reads as lapsed this week, and a dated row missing a time, price or register. It blocks the build, so it comes first.',
		'every-week': 'A standing night with no start time. Fixing the rule closes the gap permanently, not just for this week — so these are worth more than their count suggests.',
		due: 'The tier its nights give it, worked out every time, never stored: A (confirmed, held 3+ months) a month after the last confirmation — the monthly sweep, which spreads itself across the weeks — and B (held under 3) a week after.',
		sweep: 'A night attended but not called since. Being there confirms it ran, not that next week is on — only a call does.',
		unclassified: 'Question 6 has never been asked here. Costs nothing to add to a call already happening, and it is the only thing that can produce a Chill night.'
	};

	// A venue that can't be dialled at all is not a call, it's desk research: it leaves
	// the groups for the unreachable list, where the number can be typed straight in.
	// A venue with ANY number on its nights — a flyer's reservations line, an
	// organiser — stays on the round: a worse call, but a possible one.
	const dialable = (r: (typeof data.queue)[number]) =>
		r.callWho === 'unknown' ? !!r.booking : r.callWho === 'organiser' ? !!r.organiser?.phone : !!r.venue.phone;
	const reachable = $derived(new Set(data.queue.filter(dialable).map((r) => r.venue.id)));
	const noNumber = $derived(data.queue.filter((r) => r.callWho === 'venue' && !r.venue.phone && !reachable.has(r.venue.id)));
	const callable = $derived(data.queue.filter((r) => !noNumber.includes(r)));
	const groups = $derived(
		GROUPS.map((g) => ({ ...g, rows: callable.filter((r) => r.group === g.key) })).filter((g) => g.rows.length)
	);
	// By whoever the row dials: a flyer's number is callable even though nobody owns it yet.
	const missingNumbers = $derived(
		data.queue.filter((r) => (r.callWho === 'organiser' ? !r.organiser?.phone : r.callWho === 'venue' ? !r.venue.phone : false)).length
	);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const dayLabel = (date: string) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`;

	// ── By date: one flat list. Each row keeps its group's bar and label. ──
	type Reminder = (typeof data.reminders)[number];
	type Entry = { key: string; date: string | null; order: number; label: string; tone: string } & (
		| { kind: 'queue'; row: QueueRow }
		| { kind: 'reminder'; reminder: Reminder }
	);
	// The by-type order, which also breaks ties and orders the undated bucket.
	const ORDER: Record<GroupKey | 'reminder', number> = {
		'this-week': 0,
		'every-week': 1,
		due: 2,
		sweep: 3,
		unclassified: 4,
		reminder: 5
	};
	const flat = $derived.by(() => {
		const label = (k: GroupKey) => GROUPS.find((g) => g.key === k)!.label;
		const all: Entry[] = [
			...callable.map((row, i): Entry => ({ kind: 'queue', row, key: `q:${row.key}`, date: rowDate(row), order: ORDER[row.group] * 1000 + i, label: label(row.group), tone: TONE[row.group] })),
			...data.reminders.map((reminder, i): Entry => ({ kind: 'reminder', reminder, key: `r:${reminder.id}`, date: reminder.due, order: ORDER.reminder * 1000 + i, label: 'You asked yourself to', tone: 'text-dated' }))
		];
		// Soonest first, so the most overdue is at the top. Nothing undated is given a date.
		const dated = all.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.order - b.order);
		return {
			overdue: dated.filter((e) => e.date! < data.today),
			coming: dated.filter((e) => e.date! >= data.today),
			undated: all.filter((e) => !e.date).sort((a, b) => a.order - b.order)
		};
	});
	function when(date: string) {
		const d = daysBetween(data.today, date);
		if (d < 0) return { text: `overdue ${-d}d · ${dayLabel(date)}`, tone: 'text-energy font-semibold' };
		if (d === 0) return { text: `today · ${dayLabel(date)}`, tone: 'text-social' };
		return { text: dayLabel(date), tone: 'text-dim' };
	}
	let clearing = $state<Set<string>>(new Set());
	async function done(id: string) {
		clearing = new Set([...clearing, id]);
		await reminderAction('done', { id });
	}
</script>

<svelte:head>
	<title>This week · week of {shortDate(data.week)}</title>
</svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Thursday</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">What’s owed — week of Mon {shortDate(data.week)}</h1>
				<p class="mt-1 text-sm text-dim">
					{plural(data.queue.length, 'venue')} on the call round. The top two groups are what stops next week publishing.
				</p>
				{#if data.health.written}
					<p class="mt-1 font-mono text-xs">
						<a href="#reminders" class="text-dim hover:text-fg">{plural(data.health.open, 'reminder')}</a>
						{#if data.health.overdue}<span class="ml-1 rounded bg-energy/20 px-1.5 py-0.5 font-semibold text-energy">{data.health.overdue} overdue</span>{/if}
					</p>
				{/if}
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/calls?week={addDays(data.week, -7)}" class="btn">←</a>
			<a href="/calls?week={addDays(data.week, 7)}" class="btn">→</a>
			<div class="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Sort">
				{#each [['type', 'By type'], ['date', 'By date']] as const as [key, text] (key)}
					<button
						type="button"
						class="h-10 px-3 {sort === key ? 'bg-chill/15 text-fg' : 'text-dim hover:text-fg'}"
						aria-pressed={sort === key}
						onclick={() => setSort(key)}>{text}</button
					>
				{/each}
			</div>
			<a href="/venues" class="btn">Venues</a>
			<Visits />
			<a href="/add" class="btn" title="Add to the register">+ Add</a>
			<a href="/build?week={data.week}" class="btn">Sunday Build →</a>
		</nav>
	</header>

	{#if data.newActs.length}
		<div class="mx-4 mt-4 rounded-md border border-line bg-panel px-4 py-2 sm:mx-6"><NewActsPrompt names={data.newActs} /></div>
	{/if}
	{#if data.queue.length && missingNumbers}
		<div class="mx-4 mt-5 rounded-md border border-energy/40 bg-energy/10 px-4 py-3 text-sm sm:mx-6">
			<p class="font-semibold">
				<span class="mr-2 text-energy">!</span>{plural(data.queue.length, 'venue')} to call.
				<span class="text-energy">
					{missingNumbers === data.queue.length
						? 'None of them has a phone number on file.'
						: `${missingNumbers} ${missingNumbers === 1 ? 'has' : 'have'} no phone number on file.`}
				</span>
			</p>
			<p class="mt-1 text-fg/80">
				The register holds {data.register.venues} venues and {data.register.numbers}
				{data.register.numbers === 1 ? 'number' : 'numbers'}.
				{#if missingNumbers === data.queue.length}The call round cannot start.{/if}
				Finding numbers is desk research, not calling — venue pages, Instagram bios, Google listings. Type a number
				straight into its row and press Enter, or work through <a href="/venues" class="text-chill underline">all venues</a>.
			</p>
		</div>
	{/if}

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0">
			{#if !data.queue.length}
				<p class="rounded-md border border-dashed border-line px-4 py-3 text-sm text-dim">
					Nobody to call. Every dated row clears, every standing night is timed, swept and classed.
				</p>
			{/if}

			<!-- Every group here is a phone call. Vouches running out need a visit, so they live
			     under the Sunday Build's register balance, never on this round. -->
			<!-- By date, every row says which group it came from and the date that drives it. -->
			{#snippet tag(e: Entry)}
				<p class="mb-0.5 font-mono text-[10px] tracking-wider uppercase">
					<span class={e.tone}>{e.label}</span>
					{#if e.date}{@const w = when(e.date)}<span class="text-dim"> · </span><span class={w.tone}>{w.text}</span>{/if}
				</p>
			{/snippet}

			{#snippet queueRow(row: QueueRow, entry: Entry | null)}
							{@const href = withWeek(row.items[0].href)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-md border border-l-4 border-line bg-panel px-4 py-3 text-sm hover:border-dim sm:grid-cols-[minmax(0,1fr)_150px_190px_60px] sm:items-center {EDGE[row.group]}"
							>
								<a {href} class="min-w-0">
									{#if entry}{@render tag(entry)}{/if}
									{#if row.organiser}
										<p class="font-semibold hover:underline">
											Call {row.organiser.contactName ?? row.organiser.name}
											<span class="font-mono text-[10px] tracking-wider text-dated">ORGANISER{row.organiser.contactName ? ` · ${row.organiser.name}` : ''}</span>
										</p>
										<p class="text-xs text-social">not {row.venue.name} — it’s their night, so they’re the ones who know</p>
									{:else if row.booking}
										<p class="font-semibold hover:underline">
											{row.venue.name}
											<span class="font-mono text-[10px] tracking-wider text-social">UNKNOWN NUMBER</span>
										</p>
										<p class="text-xs text-social">{UNKNOWN_LABEL}{row.booking.note ? ` · ${row.booking.note}` : ''}</p>
									{:else}
										<p class="font-semibold hover:underline">{row.venue.name}</p>
									{/if}
									{#each row.items as item (item.text)}
										<p class="text-xs text-dim">{item.text}</p>
									{/each}
								</a>
								<span class="font-mono text-[10px] tracking-wider {row.venue.zone ? 'text-dim' : 'text-social'}">
									{row.venue.zone ?? 'NO ZONE'}
								</span>
								{#if row.organiser}
									<span class="col-span-2 font-mono text-xs sm:col-span-1 {row.organiser.phone ? 'text-fg' : 'text-social'}">
										{row.organiser.phone ?? 'no number'}{row.organiser.whatsapp ? ' · WhatsApp' : ''}
									</span>
								{:else if row.booking}
									<span class="col-span-2 font-mono text-xs text-fg sm:col-span-1">{row.booking.phone}</span>
								{:else}
								<!-- A number found by desk research saves here; it is not a call. -->
								<form
									method="POST"
									action="/venues?/contact"
									class="col-span-2 sm:col-span-1"
									use:enhance={() => {
										phoneErrors[row.venue.id] = '';
										return async ({ result, update }) => {
											if (result.type === 'failure') phoneErrors[row.venue.id] = String(result.data?.error ?? 'Not saved');
											else await update();
										};
									}}
								>
									<input type="hidden" name="id" value={row.venue.id} />
									<input type="hidden" name="updatedAt" value={row.venue.updatedAt} />
									<input
										name="phone"
										type="tel"
										inputmode="tel"
										autocomplete="off"
										value={row.venue.phone ?? ''}
										placeholder="no number — add"
										aria-label="Phone for {row.venue.name}"
										class="input h-11 font-mono text-xs {row.venue.phone ? '' : 'placeholder:text-social'}"
									/>
									{#if phoneErrors[row.venue.id]}<p class="mt-1 text-[11px] text-energy">{phoneErrors[row.venue.id]}</p>{/if}
								</form>
								{/if}
								<a {href} class="font-mono text-[10px] tracking-wider text-chill">{row.askQ6 ? 'ASK Q6' : ''}</a>
							</div>
			{/snippet}

			{#snippet reminderRow(r: Reminder, entry: Entry)}
				<div class="flex items-start gap-3 rounded-md border border-l-4 border-l-dated border-line bg-panel px-4 py-3 text-sm {clearing.has(r.id) ? 'opacity-40' : ''}">
					<button
						type="button"
						onclick={() => done(r.id)}
						disabled={clearing.has(r.id)}
						class="mt-0.5 size-5 shrink-0 rounded border border-dim hover:border-vetted hover:bg-vetted/20"
						aria-label="Mark done: {r.body}"
						title="Done"
					></button>
					<div class="min-w-0">
						{@render tag(entry)}
						<p>{r.body}</p>
						<a href={r.subject.href} class="text-xs text-dim hover:text-fg hover:underline">{r.subject.label}</a>
					</div>
				</div>
			{/snippet}

			{#snippet group(g: (typeof groups)[number])}
				<section class="mb-7">
					<div class="mb-2 flex items-center gap-3 font-mono text-xs">
						<h2 class="font-semibold tracking-wider uppercase {TONE[g.key]}">{g.label}</h2>
						<span class="text-dim">{g.hint}</span>
						<span class="h-px flex-1 bg-line"></span>
						<span class="text-dim">{g.rows.length}</span>
					</div>
					<div class="space-y-2">
						{#each g.rows as row (row.key)}{@render queueRow(row, null)}{/each}
					</div>
				</section>
			{/snippet}

			{#snippet bucket(title: string, hint: string, tone: string, entries: Entry[])}
				{#if entries.length}
					<section class="mb-7">
						<div class="mb-2 flex items-center gap-3 font-mono text-xs">
							<h2 class="font-semibold tracking-wider uppercase {tone}">{title}</h2>
							<span class="text-dim">{hint}</span>
							<span class="h-px flex-1 bg-line"></span>
							<span class="text-dim">{entries.length}</span>
						</div>
						<div class="space-y-2">
							{#each entries as e (e.key)}
								{#if e.kind === 'queue'}{@render queueRow(e.row, e)}
								{:else}{@render reminderRow(e.reminder, e)}{/if}
							{/each}
						</div>
					</section>
				{/if}
			{/snippet}

			<!-- Discovery: no night on file, nobody has asked. No date and never will have one,
			     so it is capped, ranked, and the same in both sorts. It never counts in the badge. -->
			{#snippet discoveryLists()}
				{@const d = data.discovery}
				{#if d.total}
					<section class="mb-7">
						<div class="mb-2 flex items-center gap-3 font-mono text-xs">
							<h2 class="font-semibold tracking-wider text-chill uppercase">Discovery</h2>
							<span class="text-dim">no programme on file — nobody has asked</span>
							<span class="h-px flex-1 bg-line"></span>
							<span class="text-dim">{d.rows.length} of {d.total}</span>
						</div>
						<p class="mb-2 text-xs text-dim">
							Likely-quiet names first — that’s how Chill gets filled. The label is a guess from the name, and it will be wrong often.
							{#if d.waiting}{plural(d.waiting, 'venue')} tried today with no answer {d.waiting === 1 ? 'is' : 'are'} back next working day.{/if}
						</p>
						<div class="space-y-1.5">
							{#each d.rows as v (v.id)}
								<a
									href="/calls/discover/{v.id}?week={data.week}"
									class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md border border-l-4 border-line border-l-chill bg-panel px-4 py-2.5 text-sm hover:border-dim sm:grid-cols-[minmax(0,1fr)_110px_150px_140px]"
								>
									<span class="min-w-0 font-semibold">{v.name}</span>
									<span class="font-mono text-[10px] tracking-wider {v.expected === 'LIKELY_QUIET' ? 'text-chill' : v.expected === 'LIKELY_LOUD' ? 'text-energy' : 'text-dim'}" title="A guess from the venue’s name">
										{v.expected === 'LIKELY_QUIET' ? 'guess: quiet' : v.expected === 'LIKELY_LOUD' ? 'guess: loud' : 'guess: ?'}
									</span>
									<span class="font-mono text-[10px] tracking-wider {v.zone ? 'text-dim' : 'text-social'}">{v.zone ?? 'NO ZONE'}</span>
									<span class="font-mono text-xs text-dim">
										{v.dial}{v.contactAttempts ? ` · ${v.contactAttempts} no-answer${v.contactAttempts === 1 ? '' : 's'}` : v.lastContacted ? '' : ' · never called'}
									</span>
								</a>
							{/each}
						</div>
					</section>
				{/if}
				<!-- Unreachable: not a call. No number on file, or four no-answers in a row — it
				     measures the numbers, not the venues. Find or fix the number and it rejoins. -->
				{#if d.needNumber}
					<p class="mb-7 text-sm">
						<a href="/venues" class="text-chill hover:underline">{plural(d.needNumber, 'venue')} with no night need a number · desk research →</a>
					</p>
				{/if}
				{#if noNumber.length || d.unreachable.length}
					<section class="mb-7">
						<div class="mb-2 flex items-center gap-3 font-mono text-xs">
							<h2 class="font-semibold tracking-wider text-social uppercase">Unreachable</h2>
							<span class="text-dim">no number, or four no-answers — desk research, not a call</span>
							<span class="h-px flex-1 bg-line"></span>
							<span class="text-dim">{noNumber.length + d.unreachable.length}</span>
						</div>
						<div class="space-y-1.5">
							{#each noNumber as row (row.key)}
								<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md border border-l-4 border-line bg-panel px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_200px] {EDGE[row.group]}">
									<div class="min-w-0">
										<a href="/venues/{row.venue.id}" class="font-semibold hover:underline">{row.venue.name}</a>
										<p class="text-xs text-dim">no number · {row.items.map((i) => i.text).join(' · ')}</p>
									</div>
									<form
										method="POST"
										action="/venues?/contact"
										use:enhance={() => {
											phoneErrors[row.venue.id] = '';
											return async ({ result, update }) => {
												if (result.type === 'failure') phoneErrors[row.venue.id] = String(result.data?.error ?? 'Not saved');
												else await update();
											};
										}}
									>
										<input type="hidden" name="id" value={row.venue.id} />
										<input type="hidden" name="updatedAt" value={row.venue.updatedAt} />
										<input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="found it — type it here" aria-label="Phone for {row.venue.name}" class="input h-10 font-mono text-xs placeholder:text-social" />
										{#if phoneErrors[row.venue.id]}<p class="mt-1 text-[11px] text-energy">{phoneErrors[row.venue.id]}</p>{/if}
									</form>
								</div>
							{/each}
							{#each d.unreachable as v (v.id)}
								<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel px-4 py-2.5 text-sm">
									<div class="min-w-0">
										<a href="/venues/{v.id}" class="font-semibold hover:underline">{v.name}</a>
										<p class="text-xs text-dim">no night on file</p>
									</div>
									<span class="font-mono text-xs text-dim">{v.phones.join(' / ')} · {v.contactAttempts} no-answers — check the number</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/snippet}

			{#if sort === 'date'}
				{@render bucket('Overdue', 'most overdue first', 'text-energy', flat.overdue)}
				{@render bucket('Today and coming up', 'soonest first', 'text-fg', flat.coming)}
				{@render bucket('No date', 'nothing dates these, and none is invented', 'text-dim', flat.undated)}
				{@render discoveryLists()}
				<!-- The one way anything is added here: a reminder, which must hang off a record. -->
				<section class="mb-7"><Reminders items={[]} today={data.today} subjects={data.subjects} /></section>
			{:else}
			{#each groups as g (g.key)}
				{@render group(g)}
			{/each}
			{@render discoveryLists()}

			<!-- Sixth: written by hand. Always below the derived groups — an overdue flyer is not
			     more urgent than a row that cannot publish, and the ranking is what makes the queue trustworthy. -->
			<section id="reminders" class="mb-7 scroll-mt-4">
				<div class="mb-2 flex items-center gap-3 font-mono text-xs">
					<h2 class="font-semibold tracking-wider text-dated uppercase">You asked yourself to</h2>
					<span class="text-dim">written by hand, not derived</span>
					<span class="h-px flex-1 bg-line"></span>
					<span class={data.health.overdue ? 'font-semibold text-energy' : 'text-dim'}>
						{data.reminders.length}{data.health.overdue ? ` · ${data.health.overdue} overdue` : ''}
					</span>
				</div>
				<Reminders items={data.reminders} today={data.today} subjects={data.subjects} />
			</section>
			{/if}
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="panel-title">If you stopped now</h3>
					<span class="font-mono text-xs {data.gate.publishable ? 'text-vetted' : 'text-energy'}">
						{data.gate.passed} / {data.gate.total}
					</span>
				</div>
				<ul class="space-y-3 text-sm">
					{#each data.gate.checks as c (c.label)}
						<li class="flex gap-3 {c.pass === null ? 'opacity-50' : ''}">
							<span class="w-3 font-mono {c.pass ? 'text-vetted' : c.pass === false ? 'text-energy' : 'text-dim'}">
								{c.pass ? '✓' : c.pass === false ? '✕' : '–'}
							</span>
							<div>
								<p>{c.label}</p>
								<p class="text-xs text-dim">{c.detail}</p>
								{#if c.forecast}<p class="font-mono text-[11px] text-vetted/80">{c.forecast}</p>{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<section class="panel">
				<h3 class="panel-title mb-3">Why each group is here</h3>
				<div class="space-y-3">
					{#each GROUPS as g (g.key)}
						<div class="border-l-2 pl-3 {EDGE[g.key]}">
							<p class="font-mono text-[10px] tracking-wider uppercase {TONE[g.key]}">{g.label}</p>
							<p class="text-xs text-fg/80">{WHY[g.key]}</p>
						</div>
					{/each}
				</div>
			</section>

			{#if data.health.written}
				{@const h = data.health}
				<section class="panel">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="panel-title">Are reminders working?</h3>
						<a href="/reminders" class="font-mono text-[10px] text-dim hover:text-fg">done →</a>
					</div>
					<dl class="grid grid-cols-4 gap-2 text-center font-mono">
						<div><dd class="text-lg">{h.written}</dd><dt class="text-[10px] text-dim">written</dt></div>
						<div><dd class="text-lg text-vetted">{h.cleared}</dd><dt class="text-[10px] text-dim">cleared</dt></div>
						<div><dd class="text-lg {h.overdue ? 'text-energy' : ''}">{h.overdue}</dd><dt class="text-[10px] text-dim">overdue</dt></div>
						<div><dd class="text-lg">{h.oldest ? shortDate(h.oldest) : '—'}</dd><dt class="text-[10px] text-dim">oldest open</dt></div>
					</dl>
					{#if h.written >= 10 && h.cleared / h.written < 0.5}
						<p class="mt-3 text-xs text-social">
							{h.written} written, {h.cleared} cleared. That isn’t a reason to try harder — it’s the register saying writing
							reminders isn’t working for you. Stopping is a fine answer.
						</p>
					{/if}
				</section>
			{/if}

			<section class="panel">
				<h3 class="panel-title mb-2">What a call can do</h3>
				<p class="text-xs text-fg/80">
					Fill a start time, fix a price, class a room. It cannot make anything
					<span class="text-vetted">VETTED</span> — that needs the room, and the database refuses it from any source
					but attendance.
				</p>
			</section>
		</aside>
	</div>
</div>
