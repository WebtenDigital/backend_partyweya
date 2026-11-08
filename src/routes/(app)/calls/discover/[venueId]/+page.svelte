<script lang="ts">
	// The discovery call: "what do you run?" Question 6 first, then as many
	// nights as they have. Weekly and monthly become standing nights; a one-off
	// becomes a dated row. Three ways to close: nights recorded, runs nothing,
	// no answer.
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import { Q6 } from '#lib/build/calls.js';
	import { DAYS } from '#lib/build/add.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const v = $derived(data.venue);

	// svelte-ignore state_referenced_locally
	let q6 = $state(data.venue.conversationTest ?? '');
	// svelte-ignore state_referenced_locally
	let dialled = $state(data.venue.dial);
	let next = 1;
	let nights = $state([{ id: 0, recurrence: 'WEEKLY' }]);
	let saving = $state(false);

	const LABEL: Record<string, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
	const GUESS: Record<string, string> = { LIKELY_QUIET: 'guess from the name: quiet', LIKELY_LOUD: 'guess from the name: loud', UNKNOWN: 'no guess from the name' };
	const register = $derived(Q6.find((q) => q.test === q6)?.register ?? null);
</script>

<svelte:head><title>Discovery · {v.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	class="min-h-screen bg-ink pb-28 text-fg"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<input type="hidden" name="week" value={data.week} />
	<input type="hidden" name="dialled" value={dialled ?? ''} />

	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/calls?week={data.week}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← This week</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{v.name}</h1>
				<p class="font-mono text-xs text-dim">
					DISCOVERY · {[v.zone ?? 'NO ZONE', v.location].filter(Boolean).join(' · ')} · {GUESS[v.expected]}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-4">
			<span class="text-sm"><ThisWeek href="/calls?week={data.week}" /></span>
			<p class="text-right font-mono text-xs text-dim">logging as {data.caller}</p>
		</div>
	</header>

	<div class="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
		{#if v.nights}
			<p class="rounded-md border border-social/60 bg-social/10 px-4 py-3 text-sm">
				{v.name} already has {v.nights} night{v.nights === 1 ? '' : 's'} on file — this is a discovery call for venues with none.
				<a href="/calls/{v.id}?week={data.week}" class="text-chill underline">Use the ordinary call screen.</a>
			</p>
		{/if}

		<section class="panel space-y-2">
			<p class="font-mono text-[10px] tracking-wider text-dim">DIALLING</p>
			<p class="font-mono text-lg">{dialled ?? 'no number'}</p>
			{#each v.phones.filter((p) => p !== dialled) as n (n)}
				<p class="flex items-center gap-3 font-mono text-sm text-dim">
					{n}<button type="button" class="text-xs text-chill underline" onclick={() => (dialled = n)}>try this one</button>
				</p>
			{/each}
			<p class="text-xs text-dim">
				{v.lastContacted ? `Last reached ${v.lastContacted}.` : 'Never reached.'}
				{#if v.contactAttempts}{v.contactAttempts} no-answer{v.contactAttempts === 1 ? '' : 's'} so far — at 4 it moves to the unreachable list.{/if}
			</p>
		</section>

		<blockquote class="panel border-l-4 border-l-line">
			“Hi{v.contactName ? `, is this ${v.contactName}` : ''}? I’m {data.caller} from PartyWeya — we list what’s on around Kampala, and
			<strong>listings are free</strong>. What do you run in the evenings?”
		</blockquote>

		<!-- Question 6 first: it is the one reason the register carries no Chill. Required on a call that reached them. -->
		<section class="panel space-y-3">
			<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">6</span>Can people talk in there?</h2>
			<blockquote class="border-l-4 border-l-line pl-3 text-sm">
				“If I came through with friends and we wanted to actually talk, could we? Or is it full-volume?”
			</blockquote>
			<div class="grid gap-2 sm:grid-cols-3">
				{#each Q6 as q (q.test)}
					<label class="cursor-pointer rounded-md border p-3 text-sm {q6 === q.test ? 'border-chill bg-ink' : 'border-line hover:border-dim'}">
						<input type="radio" name="q6" value={q.test} bind:group={q6} class="sr-only" />
						<span class="block">{q.answer}</span>
						<span class="font-mono text-[10px] tracking-wider text-dim">→ {LABEL[q.register]}</span>
					</label>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-sm">
				<span class="text-dim">Spoke to</span>
				<select name="source" class="input h-10 w-auto">
					<option value="MANAGER">a manager</option>
					<option value="OWNER">the owner</option>
				</select>
			</label>
		</section>

		{#each nights as n, i (n.id)}
			{@const standing = n.recurrence !== 'ONE_OFF'}
			<section class="panel space-y-3">
				<div class="flex items-center justify-between">
					<h2 class="font-semibold">Night {i + 1}</h2>
					{#if nights.length > 1}
						<button type="button" class="text-xs text-dim hover:text-energy" onclick={() => (nights = nights.filter((x) => x.id !== n.id))}>remove</button>
					{/if}
				</div>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_150px]">
					<label class="field"><span>Event name</span><input name="n_name" class="input h-10" placeholder="Acoustic Thursdays" /></label>
					<label class="field"><span>Category</span>
						<select name="n_category" class="input h-10">
							<option value="">—</option>
							{#each data.categories as c (c)}<option value={c}>{c.replaceAll('_', ' ').toLowerCase()}</option>{/each}
						</select>
					</label>
					<label class="field"><span>How often</span>
						<select name="n_recurrence" class="input h-10" bind:value={n.recurrence}>
							{#each data.recurrences as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid gap-3 sm:grid-cols-4">
					{#if standing}
						<label class="field"><span>Day</span>
							<select name="n_day" class="input h-10">
								<option value="">—</option>
								{#each [1, 2, 3, 4, 5, 6, 7] as d (d)}<option value={d}>{DAYS[d]}</option>{/each}
							</select>
						</label>
						<input type="hidden" name="n_date" value="" />
					{:else}
						<label class="field"><span>Date</span><input name="n_date" type="date" min={data.today} class="input h-10" /></label>
						<input type="hidden" name="n_day" value="" />
					{/if}
					<label class="field"><span>Starts <span class="text-energy">*</span></span><input name="n_start" class="input h-10 font-mono" placeholder="21:00" /></label>
					<label class="field"><span>Ends</span><input name="n_end" class="input h-10 font-mono" placeholder="02:00" /></label>
					<label class="field"><span>Register</span>
						<select name="n_register" class="input h-10">
							<option value="">{register ? `as Q6: ${LABEL[register]}` : 'as Q6'}</option>
							{#each Object.keys(LABEL) as r (r)}<option value={r}>{LABEL[r]}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid gap-3 sm:grid-cols-4">
					<label class="field"><span>Gate price</span><input name="n_gate" class="input h-10 font-mono" placeholder="0 = free" /></label>
					{#if standing}
						<label class="field"><span>Running since</span><input name="n_since" type="month" class="input h-10" /></label>
						<input type="hidden" name="n_advance" value="" />
					{:else}
						<label class="field"><span>Advance price</span><input name="n_advance" class="input h-10 font-mono" /></label>
						<input type="hidden" name="n_since" value="" />
					{/if}
					<label class="field sm:col-span-2"><span>Lineup</span><input name="n_lineup" class="input h-10" placeholder="The Clan Band, DJ Smallz" /></label>
				</div>
				<p class="text-[11px] text-dim">
					{standing ? 'Saved as a standing night — it appears every week without being typed again.' : 'Saved as a dated one-off.'}
				</p>
			</section>
		{/each}
		<button type="button" class="btn h-10" onclick={() => (nights = [...nights, { id: next++, recurrence: 'WEEKLY' }])}>+ Add another night</button>
	</div>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<span class="text-dim">Close the call:</span>
			<button name="outcome" value="nights" class="btn-primary h-10" disabled={saving}>Nights recorded</button>
			<button name="outcome" value="nothing" class="btn h-10" disabled={saving} title="Reached, and they run nothing — an answer, not a failure">Runs nothing</button>
			<button name="outcome" value="no-answer" class="btn h-10" disabled={saving} title="Counts an attempt; back on the next working day">No answer</button>
			<p class="ml-auto max-w-xs text-[11px] text-dim">Everything saved here is FACTUAL. A call can’t vouch for a room.</p>
		</div>
	</footer>
</form>
