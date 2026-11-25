<script lang="ts">
	// One category's nights for a week — a directory, not a pick. Grouped by
	// night, Monday to Sunday, empty nights shown; ordered by night then start
	// time, never by preference and never by who paid. Its own two checks, not
	// the Sunday gate: a start time on every entry, nothing unconfirmed listed.
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { categoryLabel } from '#lib/build/categories.js';
	import { addDays, dayHeading, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const REGISTER_TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };
	const REGISTER_LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
	const KIND: Record<string, string> = { STANDING: 'standing', OVERRIDE: 'this date only', 'ONE-OFF': 'one-off' };
	const L = $derived(data.listing);
	const here = (o: { week?: string; mode?: string }) =>
		`/build/category/${data.category}?week=${o.week ?? data.week}${(o.mode ?? data.mode) === 'standing' ? '&mode=standing' : ''}`;
</script>

<svelte:head><title>{categoryLabel(data.category)} · {shortDate(data.week)}</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/build/categories?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Categories</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{categoryLabel(data.category)} · {shortDate(data.week)} – {shortDate(data.weekEnd)}</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href={here({ week: addDays(data.week, -7) })} class="btn">← Previous week</a>
			<a href={here({ week: addDays(data.week, 7) })} class="btn">Next week →</a>
		</nav>
	</header>

	<main class="mx-auto max-w-4xl space-y-4 px-4 py-5">
		<!-- Unmissable: the wrong mode makes a correct-looking list that is wrong. -->
		<div class="grid grid-cols-2 overflow-hidden rounded-md border-2 border-chill/60 text-sm" role="group" aria-label="Which list">
			{#each [['week', 'THIS WEEK', 'everything that runs — one-offs and one-date changes included'], ['standing', 'STANDING ONLY', 'the weekly rules alone — what a durable listing can carry']] as [key, title, sub] (key)}
				<a href={here({ mode: key })} class="px-4 py-3 {data.mode === key ? 'bg-chill/20 text-fg' : 'text-dim hover:bg-panel'}" aria-current={data.mode === key ? 'page' : undefined}>
					<span class="block font-mono text-sm font-semibold tracking-wider">{data.mode === key ? '● ' : '○ '}{title}</span>
					<span class="block text-xs">{sub}</span>
				</a>
			{/each}
		</div>

		<!-- How far this page can be believed. Both numbers, always. -->
		<p class="rounded-md border border-line bg-panel px-4 py-3 text-sm">
			<strong class="font-mono">{data.confidence.asked} of {data.confidence.total}</strong> standing nights have their category confirmed ·
			<a href="/build/categories/unclassified" class="text-social underline"><strong class="font-mono">{data.confidence.themed}</strong> nights in the register sit in THEMED_NIGHT</a>
			and may belong here.
		</p>

		<!-- The directory's own checks — not the Sunday gate, which this page would fail every week. -->
		<section class="panel grid gap-2 text-sm sm:grid-cols-3">
			<p class={L.noStart ? 'text-energy' : 'text-vetted'}>{L.noStart ? `✗ ${L.noStart} without a start time — held out` : '✓ every entry has a start time'}</p>
			<p class={L.unconfirmed ? 'text-energy' : 'text-vetted'}>{L.unconfirmed ? `✗ ${L.unconfirmed} unconfirmed — held out` : '✓ nothing unconfirmed listed'}</p>
			{#if L.unplaced}<p class="text-energy sm:col-span-3">✗ {L.unplaced} whose repeat can’t be placed this week — held out, not dropped</p>{/if}
			<p class="text-dim">{L.entries} listed · {L.paid} paid {L.paid === 1 ? 'entry' : 'entries'} on this page</p>
		</section>

		{#each L.days as d (d.date)}
			<section class="space-y-1.5">
				<h2 class="font-mono text-xs tracking-wider text-dim uppercase">{dayHeading(d.date)} {shortDate(d.date)}</h2>
				{#if !d.entries.length && !d.held.length}
					<p class="rounded-md border border-dashed border-line px-3 py-2 text-sm text-dim">Nothing on file.</p>
				{/if}
				{#each d.entries as r (r.key)}
					<div class="grid gap-x-4 gap-y-1 rounded-md border border-line bg-panel px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
						<div class="min-w-0">
							<p class="font-semibold">
								{r.eventName}
								{#if r.venue.paidClient}<span class="ml-1 rounded border border-dated/60 px-1 align-middle font-mono text-[10px] text-dated" title="Paid client — included, never reordered">PAID</span>{/if}
							</p>
							<p class="text-sm">{r.venue.name} <span class="font-mono text-[11px] text-dim">· {r.venue.zone ?? 'NO ZONE'}</span></p>
							{#if r.billing}<p class="text-sm text-dim">{r.billing}</p>{/if}
						</div>
						<div class="font-mono text-xs sm:text-right">
							<p>{r.startTime}{r.endTime ? `–${r.endTime}` : ''} · {r.price.entry ?? 'no price'}</p>
							{#if r.price.tables.length}<p class="text-dim">{r.price.tables.join(' · ')}</p>{/if}
							<p>
								<span class={REGISTER_TONE[r.register ?? ''] ?? 'text-dim'}>{r.register ? REGISTER_LABEL[r.register] : 'no register'}</span>
								· {r.claimType ?? 'no claim'}{r.source ? ` (${r.source.toLowerCase()})` : ''} · <span class="text-dim">{KIND[r.kind]}</span>
							</p>
						</div>
					</div>
				{/each}
				{#each d.held as h (h.row.key)}
					<!-- Held out, and shown as a gap so it isn't mistaken for "not covered". -->
					<a
						href={h.row.residencyId ? `/residencies/${h.row.residencyId}` : `/occurrences/${h.row.key}`}
						class="flex flex-wrap justify-between gap-2 rounded-md border border-dashed border-energy/50 px-3 py-2 text-sm hover:border-energy"
					>
						<span>{h.row.eventName} · {h.row.venue.name}</span>
						<span class="font-mono text-xs text-energy">held out: {h.why.join(', ')}</span>
					</a>
				{/each}
			</section>
		{/each}
	</main>
</div>
