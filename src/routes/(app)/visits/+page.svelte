<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { dayHeading } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
</script>

<svelte:head><title>Visits</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">The weekly attendance</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Visits</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm"><ThisWeek /></nav>
	</header>

	<main class="mx-auto max-w-xl space-y-4 px-4 py-5">
		{#if form?.error}<p class="text-sm text-energy">{form.error}</p>{/if}
		<section class="space-y-2">
			<h2 class="font-mono text-xs tracking-wider text-social uppercase">Not written up</h2>
			{#if !data.due.length}
				<p class="rounded-md border border-dashed border-line px-4 py-3 text-sm text-dim">Every planned visit is written up or dismissed.</p>
			{/if}
			{#each data.due as v (v.id)}
				<div class="space-y-2 rounded-md border border-l-4 border-line border-l-social bg-panel p-3">
					<p class="text-sm"><strong>{dayHeading(v.date)}</strong> · {v.venue.name} — {v.eventName}{v.register ? ` · for ${LABEL[v.register]}` : ''}</p>
					<div class="flex gap-2">
						<a href={v.href} class="btn-primary inline-flex h-10 flex-1 items-center justify-center">Write it up</a>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="id" value={v.id} />
							<!-- One tap, no confirmation: "it never happened" is a normal outcome. -->
							<button class="btn h-10">It didn’t happen</button>
						</form>
					</div>
				</div>
			{/each}
		</section>

		<section class="panel space-y-3">
			<h2 class="panel-title">Write up a night out</h2>
			<p class="text-xs text-dim">A night nobody planned — any venue, any night in the last fortnight. It goes to the same write-up, and plans nothing.</p>
			<form method="GET" class="flex gap-2">
				<select name="venue" class="input h-10 min-w-0 flex-1" value={data.venueId ?? ''}>
					<option value="">Which venue?</option>
					{#each data.venues as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
				</select>
				<button class="btn h-10">Next</button>
			</form>
			{#if data.venueId}
				{#if !data.nights.length}<p class="text-sm text-dim">No night there in the last fortnight.</p>{/if}
				{#each data.nights as n (n.ref)}
					<div class="text-sm">
						<p class="font-semibold">{n.eventName}</p>
						<div class="mt-1 flex flex-wrap gap-2">
							{#each n.dates as d (d)}<a href="/attend/{n.ref}?date={d}" class="btn h-9 text-xs">{dayHeading(d)}</a>{/each}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	</main>
</div>
