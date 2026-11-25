<script lang="ts">
	// Every category, its standing nights and its nights this week — zeros shown,
	// because a zero is the answer "not enough supply for a listing yet".
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { categoryLabel } from '#lib/build/categories.js';
	import { addDays, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Categories · {shortDate(data.week)}</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/build?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Sunday build</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Categories · {shortDate(data.week)} – {shortDate(data.weekEnd)}</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/build/categories?week={addDays(data.week, -7)}" class="btn">← Previous week</a>
			<a href="/build/categories?week={addDays(data.week, 7)}" class="btn">Next week →</a>
			<a href="/build/categories/unclassified" class="btn">Unclassified</a>
		</nav>
	</header>

	<main class="mx-auto max-w-3xl space-y-4 px-4 py-5">
		<!-- The single biggest thing between these pages and the truth: nights whose category says nothing. -->
		<a href="/build/categories/unclassified" class="block rounded-md border border-l-4 border-social/60 border-l-social bg-social/5 px-4 py-3 hover:bg-social/10">
			<p class="font-semibold"><span class="font-mono">{data.themed}</span> standing nights sit in THEMED_NIGHT</p>
			<p class="text-sm text-dim">
				Any of them may belong on another page — a band, a quiz, a DJ. And {data.asked} of {data.total} standing nights have their category
				confirmed at all; the rest are inferred. Every count below is a floor until they’re asked. Work down the list →
			</p>
		</a>

		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-line text-left font-mono text-[11px] tracking-wider text-dim uppercase">
					<th class="py-2 font-normal">Category</th>
					<th class="py-2 text-right font-normal">Standing</th>
					<th class="py-2 text-right font-normal">Confirmed</th>
					<th class="py-2 text-right font-normal">This week</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.categories as c (c.key)}
					<tr class="border-b border-line/60 {c.nights || c.standing ? '' : 'text-dim'}">
						<td class="py-2">{categoryLabel(c.key)}</td>
						<td class="py-2 text-right font-mono">{c.standing}</td>
						<td class="py-2 text-right font-mono {c.asked < c.standing ? 'text-social' : ''}">{c.asked}</td>
						<td class="py-2 text-right font-mono">{c.nights}</td>
						<td class="py-2 text-right"><a href="/build/category/{c.key}?week={data.week}" class="inline-flex min-h-11 items-center px-2 text-chill underline">open</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</main>
</div>
