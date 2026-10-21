<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { Q6 } from '#lib/build/calls.js';
	import { DAYS } from '#lib/build/add.js';
	import { dayHeading } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const n = $derived(data.night);

	const REGISTERS = [
		['CHILL', 'Chill', 'border-chill'],
		['SOCIAL', 'Social', 'border-social'],
		['HIGH_ENERGY', 'High-Energy', 'border-energy']
	] as const;
	const TONE: Record<string, string> = { CHILL: 'text-chill', SOCIAL: 'text-social', HIGH_ENERGY: 'text-energy' };

	// svelte-ignore state_referenced_locally — seeds the form once.
	let date = $state(data.night.date);
	// svelte-ignore state_referenced_locally
	let q6 = $state(data.night.conversationTest ?? '');
	// svelte-ignore state_referenced_locally
	let register = $state(data.night.register ?? '');
	let differed = $state('');
	let saving = $state(false);
	const future = $derived(n.kind === 'occurrence' && n.date > data.today);
</script>

<svelte:head><title>I was here · {n.eventName}</title></svelte:head>

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
				<a href={n.record} class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← {n.eventName}</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">I was here</h1>
				<p class="font-mono text-xs text-dim">
					{n.venue.name} · {n.kind === 'residency' ? `every ${DAYS[n.dayOfWeek ?? 0]}` : dayHeading(n.date)}
					{#if n.attendedAt} · last vouched {dayHeading(n.attendedAt).toLowerCase()}{n.attendedBy ? ` by ${n.attendedBy}` : ''}{/if}
				</p>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
		<p class="text-sm text-dim">
			Not the call script — you weren’t interviewing anyone. Everything here is required: someone who was in the room knows
			it without thinking.
		</p>

		<section class="panel space-y-2">
			<h2 class="font-semibold">Which night</h2>
			{#if n.kind === 'residency'}
				<input name="date" type="date" class="input h-11 w-auto" bind:value={date} max={data.today} required />
				<p class="text-xs text-dim">The night you were there, not today — it has to be a {DAYS[n.dayOfWeek ?? 0]}.</p>
			{:else}
				<p class="input flex h-11 w-auto items-center font-mono">{dayHeading(n.date)}</p>
				<p class="text-xs {future ? 'text-energy' : 'text-dim'}">
					{future ? 'This night hasn’t happened yet.' : 'A dated night is attended on its own date.'}
				</p>
			{/if}
		</section>

		<section class="panel space-y-3 border-chill/40 bg-chill/5">
			<h2 class="font-semibold"><span class="mr-2 font-mono text-xs text-dim">6</span>Could you actually talk?</h2>
			<p class="text-xs text-chill">You heard the room yourself, so this answer replaces anything a manager said on the phone.</p>
			<div class="grid gap-2 sm:grid-cols-3">
				{#each Q6 as q (q.test)}
					<label class="cursor-pointer rounded-md border p-3 text-sm {q6 === q.test ? 'border-chill bg-ink' : 'border-line hover:border-dim'}">
						<input type="radio" name="q6" value={q.test} bind:group={q6} class="sr-only" required />
						<span class="block">{q.answer}</span>
						<span class="mt-1 block font-mono text-[11px] {TONE[q.register]}">→ {q.register.replace('_', '-')}</span>
					</label>
				{/each}
			</div>
		</section>

		<section class="panel space-y-3">
			<h2 class="font-semibold">Register — this night</h2>
			<div class="grid grid-cols-3 gap-2 text-sm">
				{#each REGISTERS as [key, label, ring] (key)}
					<label class="flex h-11 cursor-pointer items-center justify-center rounded-md border {register === key ? `${ring} bg-ink ${TONE[key]}` : 'border-line hover:border-dim'}">
						<input type="radio" name="register" value={key} bind:group={register} class="sr-only" required />{label}
					</label>
				{/each}
			</div>
		</section>

		<section class="panel space-y-3">
			<h2 class="font-semibold">Did it match the record?</h2>
			<div class="grid gap-2 sm:grid-cols-2 text-sm">
				{#each [['matched', 'Matched the record'], ['differed', 'Something differed']] as [key, label] (key)}
					<label class="flex h-11 cursor-pointer items-center justify-center rounded-md border {differed === key ? 'border-fg bg-ink' : 'border-line hover:border-dim'}">
						<input type="radio" name="differed" value={key} bind:group={differed} class="sr-only" required />{label}
					</label>
				{/each}
			</div>
			{#if differed === 'differed'}
				<textarea name="note" rows="3" class="input" placeholder="What was different — goes into the internal notes, dated" required></textarea>
				<p class="text-xs text-dim">
					If the lineup, time or price really were different that night, that’s an edit, not a vouch —
					{#if n.kind === 'residency'}
						<a href="/add?venue={n.venue.id}" class="text-chill underline">log that week’s version as an override</a>.
					{:else}
						<a href={n.record} class="text-chill underline">edit this night</a>.
					{/if}
				</p>
			{/if}
		</section>

		<section class="panel space-y-2">
			<h2 class="font-semibold">Your initials</h2>
			<input name="initials" class="input h-11 w-32 font-mono uppercase" autocomplete="off" placeholder="RM" required />
			<p class="text-xs text-dim">Who stood in the room. Kept with the vouch.</p>
		</section>
	</main>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex items-center gap-3 text-sm">
			<p class="text-xs text-dim">Records the vouch. Doesn’t count as a call — the night stays on Thursday’s round.</p>
			<button class="btn-primary ml-auto h-11" disabled={saving || future}>{saving ? 'Saving…' : 'I was here'}</button>
		</div>
	</footer>
</form>
