<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { ROLES } from '#lib/build/acts.js';
	import { shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const a = $derived(data.act);
	// svelte-ignore state_referenced_locally
	let transfers = $state(a.transfers === true ? 'yes' : a.transfers === false ? 'no' : '');
	let saving = $state(false);
	const done = () => {
		saving = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			saving = false;
		};
	};
</script>

<svelte:head><title>{a.name} · Acts</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/acts" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← Acts</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{a.name}</h1>
				<p class="font-mono text-xs text-dim">{a.role?.replace('_', ' ') ?? 'NO ROLE YET'} · {data.nights.length} night{data.nights.length === 1 ? '' : 's'} billed</p>
			</div>
		</div>
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0 space-y-4">
			{#key a.updatedAt}
				<form method="POST" action="?/save" class="space-y-4" use:enhance={done}>
					<input type="hidden" name="updatedAt" value={a.updatedAt} />
					<section class="panel space-y-3">
						<h2 class="font-semibold">Who they are</h2>
						<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
							<label class="field"><span>Name, as they bill themselves</span><input name="name" class="input h-11" value={a.name} required /></label>
							<label class="field"><span>Role — it writes the billing</span>
								<select name="role" class="input h-11" value={a.role ?? ''}>
									<option value="">not sure yet</option>
									{#each ROLES as r (r)}<option value={r}>{r.replace('_', ' ')}</option>{/each}
								</select>
							</label>
						</div>
						<label class="field"><span>Other spellings it answers to, comma-separated</span>
							<input name="aliases" class="input h-11" value={a.aliases.join(', ')} placeholder="Clan Band, The Clan" />
						</label>
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="field"><span>Last seen by PartyWeya</span><input name="lastSeen" type="date" class="input h-11" value={a.lastSeen ?? ''} /></label>
							<label class="field"><span>Their agent</span>
								<select name="organiserId" class="input h-11" value={a.organiserId ?? ''}>
									<option value="">none</option>
									{#each data.organisers as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
								</select>
							</label>
						</div>
						<p class="text-[11px] text-dim">As an organiser, the agent is who you call. As an act, this is who performs. They stay separate records.</p>
					</section>

					<section class="panel space-y-3">
						<h2 class="font-semibold">Contact <span class="text-xs font-normal text-dim">— internal, never published</span></h2>
						<p class="text-xs text-dim">Acts hear about their own bookings before venues publicise them — and play venues the register has never heard of.</p>
						<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
							<label class="field"><span>Best person to call</span><input name="contactName" class="input h-11" value={a.contactName ?? ''} placeholder="—" /></label>
							<label class="field">
								<span>Number {#if a.phone && !a.phoneVerifiedAt}<span class="text-social">· unverified</span>{:else if a.phoneVerifiedAt}<span class="text-vetted">· verified {shortDate(a.phoneVerifiedAt)}</span>{/if}</span>
								<input name="phone" type="tel" class="input h-11 font-mono" value={a.phone ?? ''} placeholder="none on file" />
							</label>
						</div>
						<div class="grid gap-3 sm:grid-cols-2 sm:items-center">
							<label class="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="whatsapp" class="size-5" checked={a.whatsapp} /> On WhatsApp</label>
							<input name="bestTime" class="input h-11" value={a.bestTimeToReach ?? ''} placeholder="Best time to reach them" />
						</div>
						<div class="flex flex-wrap items-center justify-between gap-3 text-xs">
							<label class="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="paidClient" class="size-5" checked={a.paidClient} /> Paid client</label>
							<span class="font-mono text-dim">Last called <span class={a.lastContacted ? 'text-fg' : 'text-social'}>{a.lastContacted ? shortDate(a.lastContacted) : 'never'}</span></span>
						</div>
					</section>

					<section class="panel space-y-3 border-vetted/30">
						<h2 class="font-semibold">Does their name transfer?</h2>
						<div class="grid grid-cols-3 gap-2 text-sm">
							{#each [['yes', 'Yes'], ['no', 'No'], ['', 'Not decided']] as [v, label] (v)}
								<label class="flex h-11 cursor-pointer items-center justify-center rounded-md border {transfers === v ? (v === 'yes' ? 'border-vetted bg-vetted/10' : 'border-chill bg-chill/10') : 'border-line hover:border-dim'}">
									<input type="radio" name="transfers" value={v} bind:group={transfers} class="sr-only" />{label}
								</label>
							{/each}
						</div>
						<p class="text-xs text-fg/80">
							Turning this on licenses a <span class="font-mono text-vetted">TRANSFERRED</span> claim: this act’s own track record is
							the reason to go, independent of the venue. Any night billing them can then carry it; nothing else can.
						</p>
						{#if transfers === 'yes'}
							<label class="field"><span>Why — required</span>
								<input name="transfersNote" class="input h-11" value={a.transfersNote ?? ''} placeholder="Fills a room on their own name — sold out Kololo in June" required />
							</label>
						{:else}
							<input type="hidden" name="transfersNote" value={a.transfersNote ?? ''} />
						{/if}
					</section>

					<section class="panel space-y-2">
						<h2 class="font-semibold">Notes <span class="text-xs font-normal text-dim">— internal</span></h2>
						<textarea name="notes" rows="3" class="input">{a.notes ?? ''}</textarea>
					</section>

					<div class="flex items-center gap-3">
						<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save the act'}</button>
						{#if form?.saved}<span class="text-sm text-vetted">Saved ✓</span>{/if}
						{#if form?.error}<span class="text-sm text-energy">{form.error}</span>{/if}
					</div>
				</form>
			{/key}
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">Billed on</h3>
				{#if !data.nights.length}<p class="text-xs text-dim">No live night bills them right now.</p>{/if}
				<ul class="space-y-2">
					{#each data.nights as n (n.href)}
						<li>
							<a href={n.href} class="block text-sm hover:text-chill">{n.event} · <span class="text-dim">{n.venue}</span></a>
							<p class="font-mono text-[10px] text-dim">{n.when.startsWith('every') ? n.when : shortDate(n.when)} · {JSON.stringify(n.lineup)}</p>
						</li>
					{/each}
				</ul>
			</section>

			<section class="panel">
				<h3 class="panel-title mb-2">Merge another name into this one</h3>
				<p class="mb-3 text-xs text-dim">The name becomes an alias. No lineup is rewritten — old nights still read as they were billed, and resolve here.</p>
				{#if data.mergeable.length}
					<form method="POST" action="?/merge" class="flex gap-2" use:enhance={done}>
						<select name="merge" class="input h-11">
							{#each data.mergeable as n (n)}<option value={n}>{n}</option>{/each}
						</select>
						<button class="btn h-11 shrink-0">Merge</button>
					</form>
					{#if form?.merged}<p class="mt-2 text-xs text-vetted">“{form.merged}” now resolves to {a.name}.</p>{/if}
				{:else}
					<p class="text-xs text-dim">Every billed name already belongs to an act.</p>
				{/if}
			</section>
		</aside>
	</div>
</div>
