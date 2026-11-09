<script lang="ts">
	// A night out at a venue with nothing on file: add the night first, then
	// straight into its write-up. The same night block as the discovery call.
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import NightBlock from '#lib/components/NightBlock.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let recurrence = $state('WEEKLY');
	let saving = $state(false);
</script>

<svelte:head><title>Add the night · {data.venue.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	class="min-h-screen bg-ink pb-8 text-fg"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<header class="flex items-center gap-4 border-b border-line px-4 py-4 sm:px-6">
		<HomeLogo week={data.currentWeek} />
		<div class="min-w-0">
			<a href="/visits" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Visits</a>
			<h1 class="text-xl font-semibold tracking-tight">Add the night first</h1>
		</div>
	</header>

	<main class="mx-auto max-w-xl space-y-3 px-4 py-4">
		<section class="rounded-md border border-line border-l-4 border-l-social bg-panel p-3">
			<p class="font-semibold">{data.venue.name}</p>
			<p class="font-mono text-[11px] text-dim">{data.venue.zoneName ?? 'NO ZONE'}{data.venue.location ? ` · ${data.venue.location}` : ''}</p>
			<p class="mt-1 text-xs text-dim">
				Nothing on file here yet — so this visit discovers the night as well as judging it. Describe it as it runs; the write-up comes next.
				{#if data.venue.noProgramme}<span class="text-social">It was marked “runs nothing” — being there says otherwise, so that comes off.</span>{/if}
			</p>
		</section>

		<section class="panel space-y-3">
			<NightBlock
				categories={data.categories}
				recurrences={data.recurrences}
				bind:recurrence
				dateMin={data.earliest}
				dateMax={data.today}
				registerRequired
			/>
		</section>

		{#if form?.error}<p class="text-sm text-energy">{form.error}</p>{/if}
		<button class="btn-primary h-12 w-full" disabled={saving}>{saving ? 'Saving…' : 'Save the night — then the write-up'}</button>
		<p class="text-center text-[11px] text-dim">Goes in unconfirmed, like a flyer would. The write-up is what makes it attended.</p>
	</main>
</form>
