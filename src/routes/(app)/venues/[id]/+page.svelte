<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { DAYS } from '#lib/build/add.js';
	import { shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const v = $derived(data.venue);
	let saving = $state(false);
</script>

<svelte:head><title>{v.name}</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">
					{[v.zone ?? 'NO ZONE', v.division].filter(Boolean).join(' · ')}
				</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{v.name}</h1>
				{#if v.location}<p class="text-sm text-dim">{v.location}</p>{/if}
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/calls/{v.id}" class="btn">Log a call</a>
			<a href="/add?venue={v.id}" class="btn">+ Add a night</a>
			<a href="/venues" class="btn">All venues</a>
		</nav>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
		<main class="min-w-0 space-y-4">
			<form
				method="POST"
				action="?/facts"
				class="panel space-y-3"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						await update({ reset: false });
						saving = false;
					};
				}}
			>
				<input type="hidden" name="updatedAt" value={v.updatedAt} />
				<h2 class="panel-title">Venue facts</h2>
				<p class="text-xs text-dim">The same on their Tuesday as their Saturday. Public, like the venue’s name and zone.</p>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
					<label class="field"><span>Dress code</span><input name="dressCode" class="input h-11" placeholder="Smart casual, no slippers" value={v.dressCode ?? ''} /></label>
					<label class="field"><span>Parking</span><input name="parkingNote" class="input h-11" placeholder="Secure parking behind the building" value={v.parkingNote ?? ''} /></label>
					<label class="field"><span>Serves food</span>
						<select name="hasFood" class="input h-11" value={v.hasFood == null ? '' : v.hasFood ? 'yes' : 'no'}>
							<option value="">not known</option><option value="yes">yes</option><option value="no">no</option>
						</select>
					</label>
				</div>
				{#if form?.error}<p class="text-sm text-energy">{form.error}</p>{/if}
				<div class="flex items-center gap-3">
					<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save facts'}</button>
					{#if form?.saved}<span class="text-sm text-vetted">Saved ✓</span>{/if}
				</div>
			</form>

			<section class="panel">
				<h2 class="panel-title mb-3">Standing nights <span class="font-normal text-dim normal-case">— open one to edit it and its offers</span></h2>
				{#if data.residencies.length === 0}<p class="text-sm text-dim">None.</p>{/if}
				<ul class="divide-y divide-line">
					{#each data.residencies as r (r.id)}
						<li><a href="/residencies/{r.id}" class="flex h-11 items-center justify-between text-sm hover:text-chill">
							<span>{r.eventName}{r.active ? '' : ' (stopped)'}</span>
							<span class="font-mono text-xs text-dim">{DAYS[r.dayOfWeek]} · {r.startTime ?? 'no time'}</span>
						</a></li>
					{/each}
				</ul>
			</section>

			{#if data.occurrences.length}
				<section class="panel">
					<h2 class="panel-title mb-3">Coming up</h2>
					<ul class="divide-y divide-line">
						{#each data.occurrences as o (o.id)}
							<li><a href="/occurrences/{o.id}" class="flex h-11 items-center justify-between text-sm hover:text-chill">
								<span>{o.eventName}</span><span class="font-mono text-xs text-dim">{shortDate(o.date)} · {o.status.toLowerCase()}</span>
							</a></li>
						{/each}
					</ul>
				</section>
			{/if}
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">Contact</h3>
				<dl class="space-y-1.5 font-mono text-xs">
					<div class="flex justify-between"><dt>Number</dt><dd class={v.phone ? '' : 'text-social'}>{v.phone ?? 'none'}</dd></div>
					<div class="flex justify-between"><dt>Ask for</dt><dd>{v.contactName ?? '—'}</dd></div>
					<div class="flex justify-between"><dt>Last called</dt><dd class={v.lastContacted ? '' : 'text-social'}>{v.lastContacted ? shortDate(v.lastContacted) : 'never'}</dd></div>
				</dl>
				<p class="mt-3 text-xs text-dim">Numbers are edited on <a href="/venues" class="text-chill underline">the venue list</a>; calls on the call screen.</p>
			</section>
		</aside>
	</div>
</div>
