<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import PerksEditor from '#lib/components/PerksEditor.svelte';
	import { mondayOf } from '#lib/build/add.js';
	import { addDays, dayHeading, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const o = $derived(data.occurrence);

	const CATEGORIES = ['LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'SPORTS_SCREENING', 'THEMED_NIGHT', 'MOVIE_NIGHT', 'OTHER'];
	let saving = $state(false);
</script>

<svelte:head><title>{o.eventName} · {shortDate(o.date)}</title></svelte:head>

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
	<input type="hidden" name="updatedAt" value={o.updatedAt} />
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
					{o.residency ? 'This week’s version' : 'One-off'} · {o.venue.name} · {dayHeading(o.date)}
				</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{o.eventName}</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			{#if o.residency}<a href="/residencies/{o.residency.id}" class="btn">The standing night</a>{/if}
			<a href="/calls/{o.venue.id}?occurrence={o.id}" class="btn">Log a call about it</a>
		</nav>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			<section class="panel space-y-3">
				<h2 class="panel-title">The night</h2>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
					<label class="field"><span>Name</span><input name="eventName" class="input h-11" value={o.eventName} required /></label>
					<label class="field"><span>Category</span>
						<select name="category" class="input h-11" value={o.category}>
							{#each CATEGORIES as c (c)}<option value={c}>{c.replaceAll('_', ' ')}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<label class="field"><span>Starts</span><input name="startTime" class="input h-11" placeholder="21:00" value={o.startTime ?? ''} /></label>
					<label class="field"><span>Wraps</span><input name="endTime" class="input h-11" placeholder="02:00" value={o.endTime ?? ''} /></label>
					<label class="field"><span>At the gate</span><input name="priceGate" class="input h-11" inputmode="numeric" value={o.priceGate ?? ''} /></label>
					<label class="field"><span>In advance</span><input name="priceAdvance" class="input h-11" inputmode="numeric" placeholder="—" value={o.priceAdvance ?? ''} /></label>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="field"><span>Price tiers as advertised</span><input name="priceNote" class="input h-11" placeholder="165K PRE | 190K AT THE GATE" value={o.priceNote ?? ''} /></label>
					<label class="field"><span>Register</span>
						<select name="register" class="input h-11" value={o.register ?? ''}>
							<option value="">not known</option><option value="CHILL">CHILL</option><option value="SOCIAL">SOCIAL</option><option value="HIGH_ENERGY">HIGH-ENERGY</option>
						</select>
					</label>
				</div>
				<label class="field">
					<span>Lineup{o.residency?.lineup ? ` — empty shows the usual: ${o.residency.lineup}` : ''}</span>
					<input name="lineup" class="input h-11" placeholder={o.residency?.lineup ?? 'Named acts'} value={o.lineup ?? ''} />
				</label>
			</section>

			<section id="offers" class="panel scroll-mt-4 space-y-3">
				<h2 class="panel-title">This night’s offers</h2>
				{#if o.residency}
					<p class="text-xs text-dim">
						{o.residency.perkCount
							? `Any offer here replaces the standing night’s ${o.residency.perkCount} entirely for ${shortDate(o.date)}. Leave it empty to show the usual ones.`
							: 'Leave it empty to show the standing night’s offers (it has none at the moment).'}
					</p>
				{/if}
				{#key o.updatedAt}
					<PerksEditor perks={data.perks} today={data.today} weekEnd={addDays(mondayOf(o.date), 6)} />
				{/key}
			</section>
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">Status</h3>
				<p class="text-xl font-semibold {o.status === 'CONFIRMED' ? 'text-vetted' : 'text-social'}">{o.status}</p>
				<p class="mt-1 text-xs text-dim">
					{o.confirmedOn ? `Confirmed ${shortDate(o.confirmedOn)}${o.confirmedBy ? ` by ${o.confirmedBy}` : ''}` : 'Not confirmed'}
					{o.claimType ? ` · ${o.claimType}` : ''}{o.source ? ` · ${o.source}` : ''}
				</p>
				<p class="mt-3 text-xs text-dim">Editing here doesn’t confirm anything — only a logged call does.</p>
			</section>
		</aside>
	</div>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex items-center gap-3">
			{#if form?.saved}<p class="text-sm text-vetted">Saved ✓</p>{/if}
			<a href="/build?week={mondayOf(o.date)}&highlight={o.id}" class="btn ml-auto h-11 leading-7">Back to its week</a>
			<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</footer>
</form>
