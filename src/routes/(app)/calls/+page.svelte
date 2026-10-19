<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { GROUPS, type GroupKey } from '#lib/build/calls.js';
	import { addDays, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
	const missingNumbers = $derived(data.queue.filter((r) => !r.venue.phone).length);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/calls?week={addDays(data.week, -7)}" class="btn">←</a>
			<a href="/calls?week={addDays(data.week, 7)}" class="btn">→</a>
			<a href="/add" class="btn" title="Add to the register">+ Add</a>
			<a href="/build?week={data.week}" class="btn">Sunday Build →</a>
		</nav>
	</header>

	{#if data.queue.length && missingNumbers}
		<div class="mx-4 mt-5 rounded-md border border-energy/40 bg-energy/10 px-4 py-3 text-sm sm:mx-6">
			<p class="font-semibold">
				<span class="mr-2 text-energy">!</span>{plural(data.queue.length, 'venue')} to call.
				<span class="text-energy">
					{missingNumbers === data.queue.length
						? 'None of them has a phone number on file.'
						: `${missingNumbers} have no phone number on file.`}
				</span>
			</p>
			<p class="mt-1 text-fg/80">
				The register holds {data.register.venues} venues and {data.register.numbers}
				{data.register.numbers === 1 ? 'number' : 'numbers'}.
				{#if missingNumbers === data.queue.length}The call round cannot start.{/if}
				Finding numbers is desk research, not calling — venue pages, Instagram bios, Google listings. Open a venue
				and save the number with “No answer” or “Nothing to log”.
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

			{#each groups as g (g.key)}
				<section class="mb-7">
					<div class="mb-2 flex items-center gap-3 font-mono text-xs">
						<h2 class="font-semibold tracking-wider uppercase {TONE[g.key]}">{g.label}</h2>
						<span class="text-dim">{g.hint}</span>
						<span class="h-px flex-1 bg-line"></span>
						<span class="text-dim">{g.rows.length}</span>
					</div>
					<div class="space-y-2">
						{#each g.rows as row (row.venue.id)}
							<a
								href="/calls/{row.venue.id}{row.items[0].href}&week={data.week}"
								class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-md border border-l-4 border-line bg-panel px-4 py-3 text-sm hover:border-dim sm:grid-cols-[minmax(0,1fr)_150px_110px_60px] sm:items-center {EDGE[g.key]}"
							>
								<div class="min-w-0">
									<p class="font-semibold">{row.venue.name}</p>
									{#each row.items as item (item.text)}
										<p class="text-xs text-dim">{item.text}</p>
									{/each}
								</div>
								<span class="font-mono text-[10px] tracking-wider {row.venue.zone ? 'text-dim' : 'text-social'}">
									{row.venue.zone ?? 'NO ZONE'}
								</span>
								<span class="font-mono text-xs {row.venue.phone ? 'text-fg' : 'text-social'}">
									{row.venue.phone ?? 'no number'}
								</span>
								<span class="font-mono text-[10px] tracking-wider text-chill">{row.askQ6 ? 'ASK Q6' : ''}</span>
							</a>
						{/each}
					</div>
				</section>
			{/each}
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
