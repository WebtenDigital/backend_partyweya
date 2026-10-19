<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import { ROLES, ROLE_LABEL } from '#lib/build/acts.js';
	import { shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const EDGE: Record<string, string> = {
		BAND: 'border-l-energy', DJ: 'border-l-social', COMEDIAN: 'border-l-chill', HOST: 'border-l-vetted',
		ARTIST: 'border-l-dated', POET: 'border-l-chill', ACOUSTIC_ACT: 'border-l-chill', OTHER: 'border-l-dim', NONE: 'border-l-social'
	};
	const TONE: Record<string, string> = {
		BAND: 'text-energy', DJ: 'text-social', COMEDIAN: 'text-chill', HOST: 'text-vetted',
		ARTIST: 'text-dated', POET: 'text-chill', ACOUSTIC_ACT: 'text-chill', OTHER: 'text-dim', NONE: 'text-social'
	};

	const groups = $derived(
		[...ROLES.map((r) => ({ role: r as string, label: ROLE_LABEL[r] })), { role: 'NONE', label: 'No role yet' }].map((g) => ({
			...g,
			entries: data.entries.filter((e) => (e.act?.role ?? 'NONE') === g.role)
		}))
	);
	const known = $derived(data.entries.length);
	const unroled = $derived(groups.find((g) => g.role === 'NONE')!.entries.length);
	const empty = $derived(groups.filter((g) => !g.entries.length && g.role !== 'NONE'));
	const quiet = $derived(data.entries.filter((e) => e.act?.role === 'POET' || e.act?.role === 'ACOUSTIC_ACT').length);

	// svelte-ignore state_referenced_locally — opens the panel the landing prompt asked for.
	let classifying = $state<string | null>(data.classify ?? form?.billed ?? null);
	let saving = $state(false);
	$effect(() => {
		if (classifying) document.getElementById(`classify-${classifying.toLowerCase()}`)?.scrollIntoView({ block: 'center' });
	});
	const transfersLabel = (t: boolean | null | undefined) =>
		t === true ? { text: 'TRANSFERS', tone: 'text-vetted' } : t === false ? { text: 'DOES NOT', tone: 'text-dim' } : { text: 'NOT DECIDED', tone: 'text-social' };
	const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
</script>

<svelte:head><title>Acts · {known} we know</title></svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">The register</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">Acts — {known} we know</h1>
				<p class="text-sm text-dim">You can already ask which venues you know. This is the same question about people.</p>
			</div>
		</div>
		{#if unroled}
			<a href="#role-NONE" class="btn h-11 border-social/60 leading-7 text-social">{unroled} with no role yet →</a>
		{/if}
	</header>

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0">
			{#each groups.filter((g) => g.entries.length) as g (g.role)}
				<section id="role-{g.role}" class="mb-7 scroll-mt-4">
					<div class="mb-2 flex items-center gap-3 font-mono text-xs">
						<h2 class="font-semibold tracking-wider uppercase {TONE[g.role]}">{g.label}</h2>
						<span class="h-px flex-1 bg-line"></span>
						<span class="text-dim">{g.entries.length}</span>
					</div>
					<div class="space-y-2">
						{#each g.entries as e (e.key)}
							{@const t = transfersLabel(e.act?.transfers)}
							<div id={e.act ? `act-${e.act.id}` : `classify-${e.name.toLowerCase()}`} class="scroll-mt-4 rounded-md border border-l-4 border-line bg-panel {EDGE[g.role]}">
								{#snippet row()}
									<div class="min-w-0">
										<p class="font-semibold">{e.name}{#if e.billedAs.length}<span class="ml-2 font-mono text-[10px] text-dim">also billed as {e.billedAs.join(', ')}</span>{/if}</p>
										<p class="truncate text-xs text-dim">
											{e.venues.map((v) => (v.events.length === 1 && e.nights === 1 ? `${v.venue} · ${v.events[0]}` : v.venue)).join(' · ') || 'not billed anywhere yet'}
										</p>
									</div>
									<span class="font-mono text-xs text-dim">{e.nights} night{e.nights === 1 ? '' : 's'}</span>
									<span class="font-mono text-xs {e.act?.lastSeen ? 'text-fg' : 'text-social'}">{e.act?.lastSeen ? shortDate(e.act.lastSeen) : 'never seen'}</span>
									<span class="font-mono text-[10px] tracking-wider {t.tone}">{e.act ? t.text : 'CLASSIFY →'}</span>
								{/snippet}
								{#if e.act}
									<a href="/acts/{e.act.id}" class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-line/20 sm:grid-cols-[minmax(0,1fr)_70px_90px_100px] sm:items-center">{@render row()}</a>
								{:else}
									<button type="button" class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-line/20 sm:grid-cols-[minmax(0,1fr)_70px_90px_100px] sm:items-center" aria-expanded={classifying === e.name} onclick={() => (classifying = classifying === e.name ? null : e.name)}>{@render row()}</button>
								{/if}

								{#if !e.act && classifying === e.name}
									<form
										method="POST"
										action="?/classify"
										class="grid gap-3 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)_auto] sm:items-end"
										use:enhance={() => {
											saving = true;
											return async ({ update }) => {
												await update();
												saving = false;
											};
										}}
									>
										<input type="hidden" name="billed" value={e.name} />
										<label class="field"><span>Name, as they bill themselves</span><input name="name" class="input h-11" value={e.name} /></label>
										<label class="field"><span>Role</span>
											<select name="role" class="input h-11">
												<option value="">not sure yet</option>
												{#each ROLES as r (r)}<option value={r}>{r.replace('_', ' ')}</option>{/each}
											</select>
										</label>
										<label class="field"><span>Other spellings, comma-separated</span><input name="aliases" class="input h-11" placeholder="Clan Band, The Clan" /></label>
										<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Create the act'}</button>
										{#if form?.error && form.billed === e.name}<p class="text-xs text-energy sm:col-span-4">{form.error}</p>{/if}
									</form>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}

			{#if empty.length}
				<div class="flex items-center gap-3 font-mono text-xs">
					<h2 class="font-semibold tracking-wider text-dim uppercase">{empty.map((g) => g.label).join(' · ')}</h2>
					<span class="h-px flex-1 bg-line"></span>
					<span class="text-energy">nobody</span>
				</div>
			{/if}
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<h3 class="panel-title mb-3">Roles write the billing</h3>
				<p class="text-xs text-fg/80">
					You type names. Nobody types “hosted by”. The connective words come from each act’s role, so the same list reads
					differently depending on who is on it.
				</p>
				{#each data.examples as x (x.lineup.join('|'))}
					<div class="mt-3 border-t border-line pt-2">
						<p class="font-mono text-[10px] text-dim">{JSON.stringify(x.lineup)}</p>
						<p class="text-sm">{x.billing}</p>
					</div>
				{/each}
				<p class="mt-3 text-xs text-dim">All one role → a plain list. Mixed roles → the sentence assembles itself.</p>
			</section>

			<section class="panel">
				<h3 class="panel-title mb-2">Typing a lineup</h3>
				<p class="text-xs text-fg/80">
					Suggestions come from every name already billed — which is what stops <span class="font-mono">The Clan Band</span> and
					<span class="font-mono">the clan band</span> becoming two things, the way Kirinya and Kirinnya did in the areas.
				</p>
				<p class="mt-2 text-xs text-chill">A name that matches nothing saves as it is, with no role. You never stop to classify mid-entry.</p>
			</section>

			<section class="panel border-chill/40 bg-chill/5">
				<h3 class="panel-title mb-2 text-chill">Where the roster is thin</h3>
				<p class="text-xs text-fg/80">
					{WORDS[known] ?? known} acts, and
					<strong>{quiet ? `${quiet} poet${quiet === 1 ? '' : 's'} or acoustic act${quiet === 1 ? '' : 's'}` : 'no poets, no acoustic acts, no one who runs a quiet room'}</strong>.
					That is the same hole as Chill being zero, seen from the other side.
				</p>
				<p class="mt-2 text-xs text-fg/80">
					A poetry night is built around a person, and that person runs more than one. Question 7 pointed at people instead of
					buildings reaches a layer the venue calls never will.
				</p>
			</section>
		</aside>
	</div>
</div>
