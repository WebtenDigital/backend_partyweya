<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import PerksEditor from '#lib/components/PerksEditor.svelte';
	import { DAYS } from '#lib/build/add.js';
	import { daysBetween, offerStaleness, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const r = $derived(data.residency);

	const CATEGORIES = ['LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'SPORTS_SCREENING', 'THEMED_NIGHT', 'MOVIE_NIGHT', 'OTHER'];
	const confirmedAge = $derived(r.lastConfirmed ? daysBetween(r.lastConfirmed, data.today) : null);
	let saving = $state(false);
</script>

<svelte:head><title>{r.eventName} · {r.venue.name}</title></svelte:head>

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
	<input type="hidden" name="updatedAt" value={r.updatedAt} />
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Standing night · {r.venue.name}</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{r.eventName}</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/calls/{r.venue.id}?residency={r.id}" class="btn">Log a call about it</a>
			<a href="/venues/{r.venue.id}" class="btn">Venue</a>
		</nav>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			<section class="panel space-y-3">
				<h2 class="panel-title">The rule</h2>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
					<label class="field"><span>Name, as they brand it</span><input name="eventName" class="input h-11" value={r.eventName} required /></label>
					<label class="field"><span>Category</span>
						<select name="category" class="input h-11" value={r.category}>
							{#each CATEGORIES as c (c)}<option value={c}>{c.replaceAll('_', ' ')}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<label class="field"><span>Every</span>
						<select name="dayOfWeek" class="input h-11" value={String(r.dayOfWeek)}>
							{#each DAYS.slice(1) as d, i (d)}<option value={String(i + 1)}>{d}</option>{/each}
						</select>
					</label>
					<label class="field"><span>Starts</span><input name="startTime" class="input h-11" placeholder="21:00" value={r.startTime ?? ''} /></label>
					<label class="field"><span>Wraps</span><input name="endTime" class="input h-11" placeholder="02:00" value={r.endTime ?? ''} /></label>
					<label class="field"><span>At the gate</span><input name="priceGate" class="input h-11" inputmode="numeric" placeholder="0 for free" value={r.priceGate ?? ''} /></label>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="field"><span>Register</span>
						<select name="register" class="input h-11" value={r.register}>
							<option value="CHILL">CHILL</option><option value="SOCIAL">SOCIAL</option><option value="HIGH_ENERGY">HIGH-ENERGY</option>
						</select>
					</label>
					<label class="field"><span>Running since</span><input name="runningSince" type="month" class="input h-11" value={r.runningSince ?? ''} max={data.today.slice(0, 7)} /></label>
				</div>
				<label class="field"><span>Resident act — public, shown every week</span>
					<input name="lineup" class="input h-11" placeholder="The Clan Band" value={r.lineup ?? ''} />
				</label>
				<label class="flex h-11 items-center gap-2 text-sm">
					<input type="checkbox" name="active" class="size-5" checked={r.active} /> Still running — untick to take it off every week
				</label>
			</section>

			<section class="panel space-y-3">
				<h2 class="panel-title">Offers</h2>
				{#key r.updatedAt}
					<PerksEditor perks={data.perks} today={data.today} staleness={offerStaleness(r.lastConfirmed, data.today)} />
				{/key}
			</section>

			<section class="panel space-y-2">
				<h2 class="panel-title">Notes <span class="font-normal text-dim normal-case">— internal, never published</span></h2>
				<textarea name="notes" rows="3" class="input">{r.notes ?? ''}</textarea>
			</section>
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">Last confirmed</h3>
				<p class="text-2xl font-semibold {confirmedAge == null || confirmedAge > 35 ? 'text-social' : 'text-vetted'}">
					{r.lastConfirmed ? shortDate(r.lastConfirmed) : 'never'}
				</p>
				<p class="mt-1 text-xs text-dim">
					{#if confirmedAge == null}
						Nobody has confirmed this night yet. It stays a lead until a call does.
					{:else}
						{confirmedAge} days ago{confirmedAge > 35 ? ' — past the monthly sweep, so it’s a lead again' : ''}.
						{r.claimType ?? ''}{r.source ? ` · ${r.source}` : ''}
					{/if}
				</p>
				<p class="mt-3 text-xs text-dim">Editing here doesn’t confirm anything — only a logged call does.</p>
			</section>
			{#if r.organiser}
				<section class="panel">
					<h3 class="panel-title mb-2">Organiser</h3>
					<p class="text-sm">{r.organiser} runs this night — calls about it go to them.</p>
				</section>
			{/if}
		</aside>
	</div>

	<footer class="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
		{#if form?.error}<p class="mb-2 text-sm text-energy">{form.error}</p>{/if}
		<div class="flex items-center gap-3">
			{#if form?.saved}<p class="text-sm text-vetted">Saved ✓</p>{/if}
			<a href="/build?week={data.currentWeek}" class="btn ml-auto h-11 leading-7">Back to the week</a>
			<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</footer>
</form>
