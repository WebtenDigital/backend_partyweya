<script lang="ts">
	// The worklist that clears the guesswork: nights filed THEMED_NIGHT, or whose
	// category nobody has asked. By venue, so a call session works straight down it.
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { categoryLabel } from '#lib/build/categories.js';
	import { DAYS } from '#lib/build/add.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const themed = $derived(data.nights.filter((n) => n.category === 'THEMED_NIGHT').length);
</script>

<svelte:head><title>Unclassified nights</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/build/categories" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Categories</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Unclassified nights</h1>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-3xl space-y-3 px-4 py-5">
		<p class="text-sm text-dim">
			{data.nights.length} standing nights — {themed} filed THEMED_NIGHT, and every one here never asked. Question 5 on the call screen clears
			them: “What kind of night is it?”
		</p>
		<ul class="divide-y divide-line/60">
			{#each data.nights as n (n.id)}
				<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
					<span class="min-w-0">
						<span class="block font-semibold">{n.venue} <span class="font-mono text-[11px] font-normal text-dim">· {n.zone ?? 'NO ZONE'}</span></span>
						<span class="block text-sm text-dim">{n.eventName} · {DAYS[n.dayOfWeek]}</span>
					</span>
					<span class="flex items-center gap-3">
						<span class="font-mono text-[11px] {n.category === 'THEMED_NIGHT' ? 'text-social' : 'text-dim'}">{categoryLabel(n.category)}{n.asked ? '' : ' · not asked'}</span>
						<a href="/calls/{n.venueId}?ref={n.id}" class="btn inline-flex h-11 items-center">Call</a>
					</span>
				</li>
			{/each}
		</ul>
	</main>
</div>
