<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { CADENCE } from '#lib/build/calls.js';
	import { shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const a = $derived(data.act);

	type Gig = { date: string; venue: string; eventName: string; billing: string };
	// svelte-ignore state_referenced_locally
	const blank = (): Gig => ({ date: '', venue: '', eventName: '', billing: data.act.name });
	let gigs = $state<Gig[]>([blank()]);
	let outcome = $state('');
	let saving = $state(false);
	const known = $derived(new Set(data.venues.map((v) => v.name.toLowerCase())));
</script>

<svelte:head><title>Call · {a.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="min-h-screen bg-ink pb-28 text-fg"
>
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/acts/{a.id}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← {a.name}</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">What have you got coming up?</h1>
				<p class="font-mono text-xs text-dim">
					ACT · {a.contactName ? `${a.contactName} · ` : ''}{a.phone ?? 'no number on file'}{a.whatsapp ? ' · wa' : ''}
					{a.bestTimeToReach ? ` · best ${a.bestTimeToReach}` : ''} · last called {a.lastContacted ? shortDate(a.lastContacted) : 'never'}
				</p>
			</div>
		</div>
		<p class="text-right font-mono text-xs text-dim">logging as {data.caller}</p>
	</header>

	<main class="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
		<blockquote class="panel border-l-4 border-l-line">
			“Hi, is this {a.contactName ?? a.name}? I’m {data.caller} from PartyWeya — <strong>listings are free</strong>. Where are you
			playing in the next few weeks?”
		</blockquote>

		<section class="panel space-y-3">
			<h2 class="font-semibold">Gigs they named</h2>
			<p class="text-xs text-dim">
				Each one goes in as a confirmed night, from the performer. A start time isn’t needed — if they don’t know it, the
				night lands on the call round under “blocks this week” and the venue gets asked.
			</p>
			<datalist id="venues">
				{#each data.venues as v (v.id)}<option value={v.name}></option>{/each}
			</datalist>
			{#each gigs as g, i (i)}
				<div class="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
					<label class="field"><span>Date</span><input name="g_date" type="date" class="input h-11" min={data.today} bind:value={g.date} /></label>
					<label class="field">
						<span>Venue{#if g.venue.trim() && !known.has(g.venue.trim().toLowerCase())}<span class="text-chill"> · new — added on save</span>{/if}</span>
						<input name="g_venue" class="input h-11" list="venues" placeholder="Search {data.venues.length} venues" autocomplete="off" bind:value={g.venue} />
					</label>
					<label class="field"><span>Event name</span><input name="g_name" class="input h-11" placeholder="As it’s billed" bind:value={g.eventName} /></label>
					<label class="field sm:col-span-2"><span>Billing — headliner first, comma-separated</span><input name="g_billing" class="input h-11" bind:value={g.billing} /></label>
					<div class="flex items-end justify-end">
						{#if gigs.length > 1}<button type="button" class="btn h-11" onclick={() => gigs.splice(i, 1)}>Remove</button>{/if}
					</div>
				</div>
			{/each}
			<button type="button" class="btn h-11" onclick={() => gigs.push(blank())}>+ Another gig</button>
		</section>
	</main>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			{#each [['reached', 'Reached them', 'border-vetted text-vetted'], ['no-answer', 'No answer', 'border-fg'], ['call-back', 'Call back', 'border-fg']] as [key, text, on] (key)}
				<label class="cursor-pointer rounded-md border px-3 py-2 {outcome === key ? on : 'border-line hover:border-dim'}">
					<input type="radio" name="outcome" value={key} bind:group={outcome} class="sr-only" required />{text}
				</label>
			{/each}
			<select name="cadence" class="input w-auto" value="B">
				{#each CADENCE as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
			</select>
			<p class="max-w-64 text-xs text-dim">
				{outcome && outcome !== 'reached' ? 'Nothing is logged but the next try — tomorrow.' : 'Source ACT · confirmed · FACTUAL, or TRANSFERRED where they transfer on their own record. Nobody picks it.'}
			</p>
			<button class="btn-primary ml-auto" disabled={saving}>{saving ? 'Saving…' : 'Save call'}</button>
		</div>
	</footer>
</form>
