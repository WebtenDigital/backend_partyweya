<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import NewActsPrompt from '#lib/components/NewActsPrompt.svelte';
	import Reminders from '#lib/components/Reminders.svelte';
	import { enhance } from '$app/forms';
	import { GROUPS, type GroupKey } from '#lib/build/calls.js';
	import { UNKNOWN_LABEL } from '#lib/build/who.js';
	import { addDays, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let phoneErrors = $state<Record<string, string>>({});

	const EDGE: Record<GroupKey, string> = {
		'this-week': 'border-l-energy',
		'every-week': 'border-l-social',
		sweep: 'border-l-dim',
		unclassified: 'border-l-chill'
	};
	const TONE: Record<GroupKey, string> = {
		'this-week': 'text-energy',
		'every-week': 'text-social',
		sweep: 'text-dim',
		unclassified: 'text-chill'
	};
	const WHY: Record<GroupKey, string> = {
		'this-week': 'A dated row between today and the end of the build week, missing a time, a price, a register or a confirmation. One call each and it publishes.',
		'every-week': 'A standing night with no start time. Fixing the rule closes the gap permanently, not just for this week — so these are worth more than their count suggests.',
		sweep: 'A standing night not confirmed within the monthly sweep. One call a month, spread across four weeks rather than done in one sitting.',
		unclassified: 'Question 6 has never been asked here. Costs nothing to add to a call already happening, and it is the only thing that can produce a Chill night.'
	};

	const groups = $derived(
		GROUPS.map((g) => ({ ...g, rows: data.queue.filter((r) => r.group === g.key) })).filter((g) => g.rows.length)
	);
	// By whoever the row dials: a flyer's number is callable even though nobody owns it yet.
	const missingNumbers = $derived(
		data.queue.filter((r) => (r.callWho === 'organiser' ? !r.organiser?.phone : r.callWho === 'venue' ? !r.venue.phone : false)).length
	);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const REGISTER_TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };
	const dayLabel = (date: string) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`;
</script>

<svelte:head>
	<title>Call round · week of {shortDate(data.week)}</title>
</svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Thursday</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Call round — week of Mon {shortDate(data.week)}</h1>
				<p class="mt-1 text-sm text-dim">
					{plural(data.queue.length, 'venue')} on the list. The top two groups are what stops next week publishing.
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
			<a href="/venues" class="btn">Venues</a>
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

			<!-- The two blocking groups, then vouches running out, then the rest: an unpublishable
			     row this week beats a vouch expiring in a fortnight. -->
			{#snippet group(g: (typeof groups)[number])}
				<section class="mb-7">
					<div class="mb-2 flex items-center gap-3 font-mono text-xs">
						<h2 class="font-semibold tracking-wider uppercase {TONE[g.key]}">{g.label}</h2>
						<span class="text-dim">{g.hint}</span>
						<span class="h-px flex-1 bg-line"></span>
						<span class="text-dim">{g.rows.length}</span>
					</div>
					<div class="space-y-2">
						{#each g.rows as row (row.key)}
							{@const href = `${row.items[0].href}&week=${data.week}`}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-md border border-l-4 border-line bg-panel px-4 py-3 text-sm hover:border-dim sm:grid-cols-[minmax(0,1fr)_150px_190px_60px] sm:items-center {EDGE[g.key]}"
							>
								<a {href} class="min-w-0">
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
						{/each}
					</div>
				</section>
			{/snippet}
			{#each groups.filter((g) => g.key === 'this-week' || g.key === 'every-week') as g (g.key)}
				{@render group(g)}
			{/each}

			<section id="vouches" class="mb-7 scroll-mt-4">
				<div class="mb-1 flex items-center gap-3 font-mono text-xs">
					<h2 class="font-semibold tracking-wider text-vetted uppercase">Vouches running out</h2>
					<span class="text-dim">a vetted night you need to visit again</span>
					<span class="h-px flex-1 bg-line"></span>
					<span class="text-dim">{data.vouches.items.length}</span>
				</div>
				<p class="mb-2 text-sm text-vetted">{data.vouches.target}</p>
				{#if !data.vouches.items.length}
					<p class="rounded-md border border-dashed border-line px-4 py-3 text-sm text-dim">Every vouch in this week is live.</p>
				{/if}
				<div class="space-y-2">
					{#each data.vouches.items as v (v.ref)}
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md border border-l-4 border-line bg-panel px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_110px_200px_170px] {v.state === 'EXPIRED' ? 'border-l-energy' : 'border-l-social'}">
							<div class="min-w-0">
								<a href={v.record} class="font-semibold hover:underline">{v.eventName}</a>
								<p class="text-xs text-dim">{v.venue}</p>
							</div>
							<span class="font-mono text-[10px] tracking-wider {v.register ? REGISTER_TONE[v.register] : 'text-dim'}">{v.register?.replace('_', '-') ?? 'NO REGISTER'}</span>
							<div class="col-span-2 text-xs sm:col-span-1">
								<p class={v.state === 'EXPIRED' ? 'text-energy' : 'text-social'}><span class="font-mono text-[10px] tracking-wider">{v.state} THIS WEEK</span> · {v.expiry}</p>
								<p class="text-dim">attended {shortDate(v.attendedAt)}{v.attendedBy ? ` · ${v.attendedBy}` : ''}</p>
							</div>
							<!-- Not a call: the phone can't renew a judgement about a room. -->
							<a href={v.record} class="btn col-span-2 flex h-10 items-center justify-center text-xs sm:col-span-1">Plan a visit · {dayLabel(v.date)}</a>
						</div>
					{/each}
				</div>
			</section>

			{#each groups.filter((g) => g.key !== 'this-week' && g.key !== 'every-week') as g (g.key)}
				{@render group(g)}
			{/each}

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
