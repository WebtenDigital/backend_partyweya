<script lang="ts">
	// Visits: the planned visit not yet written up, and a type-ahead for the
	// night nobody planned. One thumb, the morning after: the input is up with
	// the keyboard, suggestions sit right under it, every row carries its zone.
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { DAYS } from '#lib/build/add.js';
	import { dayHeading } from '#lib/build/week.js';
	import { search, type NightOption } from '#lib/build/nightout.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };

	let query = $state('');
	let picked = $state<NightOption | null>(null);
	const results = $derived(search(data.nights, data.venues, query));
	const when = (n: NightOption) => [n.dayOfWeek ? DAYS[n.dayOfWeek].slice(0, 3) : null, n.startTime].filter(Boolean).join(' ');
	// Focus the search on open — unless a planned visit is waiting, which comes first.
	const focus = (el: HTMLInputElement) => {
		if (!data.due.length) el.focus();
	};
</script>

<svelte:head><title>Visits</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-4 sm:px-6">
		<div class="flex items-center gap-4">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">The weekly attendance</p>
				<h1 class="text-xl font-semibold tracking-tight">Visits</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm"><ThisWeek /></nav>
	</header>

	<main class="mx-auto max-w-xl space-y-4 px-4 py-4">
		{#if form?.error}<p class="text-sm text-energy">{form.error}</p>{/if}

		{#if data.due.length}
			<section class="space-y-2">
				<h2 class="font-mono text-xs tracking-wider text-social uppercase">Planned, not written up</h2>
				{#each data.due as v (v.id)}
					<div class="space-y-2 rounded-md border border-l-4 border-line border-l-social bg-panel p-3">
						<p class="text-sm"><strong>{dayHeading(v.date)}</strong> · {v.venue.name} — {v.eventName}{v.register ? ` · for ${LABEL[v.register]}` : ''}</p>
						<div class="flex gap-2">
							<a href={v.href} class="btn-primary inline-flex h-11 flex-1 items-center justify-center">Write it up</a>
							<form method="POST" action="?/dismiss" use:enhance>
								<input type="hidden" name="id" value={v.id} />
								<!-- One tap, no confirmation: "it never happened" is a normal outcome. -->
								<button class="btn h-11">It didn’t happen</button>
							</form>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<section class="panel space-y-2">
			<h2 class="panel-title">Write up a night out</h2>
			{#if picked}
				{@const n = picked}
				<!-- The date step: the dates this night ran in the last fortnight. -->
				<div class="rounded-md border border-line bg-ink/40 p-3">
					<p class="font-semibold">{n.venue} <span class="font-mono text-[11px] font-normal text-dim">· {n.zone ?? 'NO ZONE'}</span></p>
					<p class="text-sm text-dim">{n.eventName}{when(n) ? ` · ${when(n)}` : ''}</p>
				</div>
				<p class="text-xs text-dim">Which night were you there?</p>
				<div class="grid grid-cols-2 gap-2">
					{#each n.dates as d (d)}<a href="/attend/{n.ref}?date={d}" class="btn-primary flex h-11 items-center justify-center">{dayHeading(d)}</a>{/each}
				</div>
				<button type="button" class="h-11 w-full text-sm text-dim hover:text-fg" onclick={() => (picked = null)}>← a different night</button>
			{:else}
				<input
					type="search"
					class="input h-12 w-full text-base"
					placeholder="Venue, night, zone — “quiz”, “kololo”, “band”"
					autocomplete="off"
					enterkeyhint="search"
					bind:value={query}
					use:focus
					aria-label="Find the night"
				/>
				<p class="text-[11px] text-dim">{query.trim() ? 'Nights first, then venues with nothing on file.' : 'Ran in the last fortnight, most recent first.'}</p>
				<!-- Its own scroll area, so the keyboard never covers the suggestions. -->
				<ul class="max-h-[50vh] space-y-1.5 overflow-y-auto overscroll-contain">
					{#each results as o (o.kind === 'night' ? `${o.ref}|${o.dates[0]}` : o.venueId)}
						<li>
							{#if o.kind === 'night'}
								{#snippet nightRow(n: NightOption, dated: boolean)}
									<span class="min-w-0">
										<span class="block text-sm font-semibold">{n.venue} <span class="font-mono text-[11px] font-normal text-dim">· {n.zone ?? 'NO ZONE'}</span></span>
										<span class="block text-xs text-dim">{n.eventName}{when(n) ? ` · ${when(n)}` : ''}{dated ? ` · ${dayHeading(n.dates[0]).toLowerCase()}` : ''}</span>
									</span>
									<span class="shrink-0 font-mono text-[10px] text-vetted">write it up →</span>
								{/snippet}
								{#if query.trim()}
									<!-- A night that runs weekly: which of its dates comes next. -->
									<button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-line bg-ink/40 px-3 py-2 text-left hover:border-dim" onclick={() => (picked = o)}>
										{@render nightRow(o, false)}
									</button>
								{:else}
									<!-- The empty state is already one night on one date: straight to the write-up. -->
									<a href="/attend/{o.ref}?date={o.dates[0]}" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-line bg-ink/40 px-3 py-2 hover:border-dim">
										{@render nightRow(o, true)}
									</a>
								{/if}
							{:else}
								<a
									href="/visits/night/{o.venueId}"
									class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-dashed border-social/50 px-3 py-2 hover:border-social"
								>
									<span class="min-w-0">
										<span class="block text-sm font-semibold">{o.venue} <span class="font-mono text-[11px] font-normal text-dim">· {o.zone ?? 'NO ZONE'}</span></span>
										<span class="block text-xs text-social">{o.noProgramme ? 'marked “runs nothing”' : 'no nights on file'}</span>
									</span>
									<span class="shrink-0 font-mono text-[10px] text-social">add the night first →</span>
								</a>
							{/if}
						</li>
					{/each}
				</ul>
				{#if query.trim() && !results.length}
					<!-- Not in the register: that must not end the flow. -->
					<form method="POST" action="?/newVenue" class="space-y-2 rounded-md border border-dashed border-line p-3">
						<p class="text-sm">Nothing matches “{query.trim()}”. Add it as a new venue?</p>
						<input name="name" class="input h-11 w-full" value={query.trim()} aria-label="Venue name, as it brands itself" />
						<select name="zoneName" class="input h-11 w-full" aria-label="Zone">
							<option value="">Zone — if you know it</option>
							{#each data.zones as z (z)}<option value={z}>{z}</option>{/each}
						</select>
						{#if form?.newVenueError}<p class="text-xs text-energy">{form.newVenueError}</p>{/if}
						<button class="btn-primary h-11 w-full">Add a new venue — then its night</button>
					</form>
				{/if}
			{/if}
		</section>
	</main>
</div>
