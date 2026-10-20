<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { kampalaToday, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const h = $derived(data.health);
	const KIND: Record<string, string> = { venue: 'VENUE', act: 'ACT', organiser: 'ORGANISER', residency: 'NIGHT', occurrence: 'NIGHT' };
</script>

<svelte:head><title>Reminders · done</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Reminders</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Done — {h.cleared} of {h.written} cleared</h1>
				<p class="text-sm text-dim">
					Open ones live on the <a href="/calls#reminders" class="text-chill underline">call round</a> and on the records they hang off.
					{#if h.overdue}<span class="text-energy">{h.overdue} overdue.</span>{/if}
					{#if h.oldest}Oldest still open: {shortDate(h.oldest)}.{/if}
				</p>
			</div>
		</div>
	</header>

	<main class="max-w-3xl space-y-1.5 px-4 py-5 sm:px-6">
		{#if !data.done.length}<p class="text-sm text-dim">Nothing cleared yet.</p>{/if}
		{#each data.done as r (r.id)}
			<form method="POST" action="?/reopen" class="flex items-start gap-3 rounded-md border border-line bg-panel px-3 py-2 text-sm" use:enhance>
				<input type="hidden" name="id" value={r.id} />
				<span class="mt-0.5 font-mono text-vetted">✓</span>
				<div class="min-w-0 flex-1">
					<p class="text-fg/80">{r.body}</p>
					<p class="font-mono text-[10px] text-dim">
						done {shortDate(kampalaToday(new Date(r.doneAt!)))} ·
						<a href={r.subject.href} class="hover:text-fg hover:underline"><span class="text-dated">{KIND[r.subject.kind]}</span> {r.subject.label}</a>
					</p>
				</div>
				<button class="font-mono text-[10px] text-dim hover:text-fg" title="Ticked by mistake">reopen</button>
			</form>
		{/each}
	</main>
</div>
