<script lang="ts">
	import { enhance } from '$app/forms';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import Reminders from '#lib/components/Reminders.svelte';
	import CallPanel from '#lib/components/CallPanel.svelte';
	import PerksEditor, { toRows, type PerkRow } from '#lib/components/PerksEditor.svelte';
	import LineupInput from '#lib/components/LineupInput.svelte';
	import NewActsPrompt from '#lib/components/NewActsPrompt.svelte';
	import { splitLineup } from '#lib/build/acts.js';
	import { DAYS } from '#lib/build/add.js';
	import { F5_WINDOW_DAYS, addDays, dayHeading, daysBetween, nextMonday, shortDate } from '#lib/build/week.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const r = $derived(data.residency);

	const CATEGORIES = ['LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'SPORTS_SCREENING', 'THEMED_NIGHT', 'MOVIE_NIGHT', 'OTHER'];
	const REGISTER_EDGE: Record<string, string> = { CHILL: 'border-l-chill', SOCIAL: 'border-l-social', HIGH_ENERGY: 'border-l-energy' };
	const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

	// Form state the preview reads live. Re-seeded from the server after every save.
	const seed = () => ({
		eventName: r.eventName,
		day: String(r.dayOfWeek),
		start: r.startTime ?? '',
		register: r.register as string,
		lineup: [...r.lineup],
		notes: r.notes ?? ''
	});
	// svelte-ignore state_referenced_locally
	let rows = $state<PerkRow[]>(toRows(data.perks));
	// svelte-ignore state_referenced_locally
	let fields = $state(seed());
	let movedFrom = $state<string | null>(null);
	let seeded = '';
	$effect(() => {
		if (data.residency.updatedAt === seeded) return;
		seeded = data.residency.updatedAt;
		rows = toRows(data.perks);
		fields = seed();
	});

	// The week being assembled, and this rule's night in it.
	const week = $derived(nextMonday(data.today));
	const weekEnd = $derived(addDays(week, 6));
	const night = $derived(addDays(week, Number(fields.day) - 1));
	const shown = $derived(rows.filter((p) => p.label.trim() && (!p.activeUntil || p.activeUntil >= night)));

	const confirmedAge = $derived(r.lastConfirmed ? daysBetween(r.lastConfirmed, data.today) : null);
	const openEnded = $derived(rows.filter((p) => p.label.trim() && !p.activeUntil).length);
	const stale = $derived(openEnded > 0 && (confirmedAge == null || confirmedAge > F5_WINDOW_DAYS));

	// The act often sits in an internal note ("Featuring The Clan Band;"), where nothing public can read it.
	// "Hosted by Felicia; Music by DJ Smallz" → ["Felicia", "DJ Smallz"]: the role words come back from each act's role.
	const namesFromNote = (note: string) =>
		splitLineup(note).map((n) => n.replace(/^(featuring|feat\.?|ft\.?|hosted by|music by|with|alongside)\s+/i, '').trim()).filter(Boolean);
	let lineupKey = $state(0);
	function moveNoteToAct() {
		movedFrom = fields.notes;
		fields.lineup = namesFromNote(fields.notes);
		fields.notes = '';
		lineupKey++;
	}
	const unchanged = $derived(fields.lineup.join('|') === r.lineup.join('|'));
	const billingLine = $derived(unchanged ? data.billing : fields.lineup.join(', '));
	let lineupEl = $state<LineupInput>();

	let saving = $state(false);
	let stopping = $state(false);
	let formEl: HTMLFormElement;
	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			formEl.requestSubmit();
		}
	}
	const many = (n: number) => (n === 1 ? 'one' : (WORDS[n] ?? String(n)));
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{r.eventName} · {r.venue.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	bind:this={formEl}
	use:enhance={({ cancel }) => {
		if (!lineupEl?.confirm()) return cancel();
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			movedFrom = null;
			saving = false;
		};
	}}
	class="min-h-screen bg-ink text-fg"
>
	<input type="hidden" name="updatedAt" value={r.updatedAt} />

	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<a href="/venues/{r.venue.id}" class="font-mono text-[11px] tracking-[0.2em] text-chill uppercase">← {r.venue.name}</a>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{fields.eventName || r.eventName}</h1>
				<p class="font-mono text-xs text-dim">
					Every {DAYS[Number(fields.day)]} · {fields.start || 'no time'} · {[r.zone ?? 'NO ZONE', r.division].filter(Boolean).join(' · ')}
					{#if !r.active}<span class="ml-2 rounded border border-energy/50 px-1.5 text-energy">STOPPED{r.stoppedAt ? ` ${shortDate(r.stoppedAt)}` : ''} — {r.stoppedReason ?? 'no reason recorded'}</span>{/if}
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if form?.error}<p class="max-w-xs text-sm text-energy">{form.error}</p>{/if}
			{#if form?.saved && !saving}<p class="text-sm text-vetted">Saved ✓</p>{/if}
			{#if r.active}
				<button type="button" class="btn h-11" onclick={() => (stopping = !stopping)} aria-expanded={stopping}>Deactivate</button>
			{:else}
				<button name="intent" value="reactivate" class="btn h-11">Reactivate</button>
			{/if}
			<button class="btn-primary h-11" disabled={saving}>{saving ? 'Saving…' : 'Save the rule'}</button>
		</div>
	</header>

	{#if stopping && r.active}
		<div class="mx-4 mt-4 flex flex-wrap items-end gap-3 rounded-md border border-energy/40 bg-energy/5 px-4 py-3 sm:mx-6">
			<label class="field min-w-64 flex-1">
				<span>Why is it stopping? Shown beside it wherever it’s looked up.</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input name="stoppedReason" class="input h-11" placeholder="Ended · On break until December · Never existed" autofocus />
			</label>
			<button name="intent" value="deactivate" class="btn h-11 border-energy/60 text-energy">Stop it — off every week</button>
			<button type="button" class="btn h-11" onclick={() => (stopping = false)}>Keep it running</button>
		</div>
	{/if}

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0 space-y-4">
			<section class="panel space-y-3">
				<h2 class="font-semibold">The rule</h2>
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_180px]">
					<label class="field"><span>Event name</span><input name="eventName" class="input h-11" bind:value={fields.eventName} required /></label>
					<label class="field"><span>Category</span>
						<select name="category" class="input h-11" value={r.category}>
							{#each CATEGORIES as c (c)}<option value={c}>{c.replaceAll('_', ' ')}</option>{/each}
						</select>
					</label>
					<label class="field"><span>Night</span>
						<select name="dayOfWeek" class="input h-11" bind:value={fields.day}>
							{#each DAYS.slice(1) as d, i (d)}<option value={String(i + 1)}>{d}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<label class="field"><span>Starts</span><input name="startTime" class="input h-11" placeholder="21:00" bind:value={fields.start} /></label>
					<label class="field"><span>Wraps</span><input name="endTime" class="input h-11" placeholder="—" value={r.endTime ?? ''} /></label>
					<label class="field"><span>At the gate</span><input name="priceGate" class="input h-11" inputmode="numeric" placeholder="—" value={r.priceGate ?? ''} /></label>
					<label class="field"><span>Register</span>
						<select name="register" class="input h-11" bind:value={fields.register}>
							<option value="CHILL">CHILL</option><option value="SOCIAL">SOCIAL</option><option value="HIGH_ENERGY">HIGH_ENERGY</option>
						</select>
					</label>
				</div>
			</section>

			<section class="panel space-y-3">
				<h2 class="flex items-center gap-2 font-semibold">The act</h2>
				<p class="text-xs text-dim">
					A resident act is as stable as the start time, so it lives on the rule. Only name a week’s act in an override when
					knowing it changes what you’d write.
				</p>
				{#key `${r.updatedAt}-${lineupKey}`}
					<LineupInput bind:this={lineupEl} value={fields.lineup} bind:names={fields.lineup} suggestions={data.suggestions} placeholder="The Clan Band" onresolved={() => formEl.requestSubmit()} />
				{/key}
				{#if fields.lineup.length > 1}<p class="text-xs text-dim">Billed as: <span class="text-fg">{billingLine}</span>{unchanged ? '' : ' — the connecting words come from each act’s role once saved'}</p>{/if}
				{#if form?.newNames?.length && !saving}<NewActsPrompt names={form.newNames} />{/if}
				{#if movedFrom}
					<p class="rounded-md border border-chill/40 bg-chill/5 px-3 py-2 text-xs text-chill">
						→ Moved here from the internal note <em>“{movedFrom}”</em>, which nothing could read. Save the rule to keep it.
						{#if data.supply.noted}
							{many(data.supply.noted).replace(/^./, (c) => c.toUpperCase())} other standing night{data.supply.noted === 1 ? '' : 's'}
							still carr{data.supply.noted === 1 ? 'ies' : 'y'} a note that may be their act.
						{/if}
					</p>
				{:else if fields.notes.trim() && !fields.lineup.length}
					<p class="flex flex-wrap items-center gap-2 rounded-md border border-chill/40 bg-chill/5 px-3 py-2 text-xs text-chill">
						<span>The internal note says <em>“{fields.notes}”</em> — nothing public can read it. If that’s the act:</span>
						<button type="button" class="rounded border border-chill/60 px-2 py-1 hover:bg-chill/10" onclick={moveNoteToAct}>Move it to the act</button>
					</p>
				{/if}
			</section>

			<section id="offers" class="panel scroll-mt-4 space-y-3">
				<h2 class="flex items-center gap-2 font-semibold">What else is on that night</h2>
				<p class="text-xs text-dim">
					Offers go stale faster than anything else here, and a wrong one costs more than a missing one. Each gets its own
					expiry so a dead promo drops out instead of quietly outliving its truth.
				</p>
				<PerksEditor bind:rows today={data.today} {weekEnd} />
				{#if stale}
					<p class="rounded-md border border-social/50 bg-social/10 px-3 py-2 text-xs">
						<span class="mr-1 text-social">!</span>
						The {many(openEnded)} with no end date
						{#if confirmedAge == null}
							{openEnded === 1 ? 'has' : 'have'} <strong>never been confirmed</strong>.
						{:else}
							{openEnded === 1 ? 'was' : 'were'} last confirmed
							<strong>{confirmedAge < 14 ? `${confirmedAge} days` : `${Math.round(confirmedAge / 7)} weeks`} ago</strong> — outside Rule F5’s window.
						{/if}
						Ask about {openEnded === 1 ? 'it' : 'them'} on the next call before publishing {openEnded === 1 ? 'it' : openEnded === 2 ? 'either' : 'any'}.
					</p>
				{/if}
			</section>

			<div class="flex items-center gap-3 py-2 font-mono text-[10px] tracking-[0.2em] text-dim uppercase">
				<span class="h-px flex-1 bg-line"></span>Everything above goes out · everything below stays in<span class="h-px flex-1 bg-line"></span>
			</div>

			<section class="panel space-y-3">
				<h2 class="font-semibold">Internal</h2>
				<p class="text-xs text-dim">Never reaches <code class="font-mono">public_events</code>. Anything that would change how the next call goes.</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="field"><span>Running since{r.runningSince ? '' : ' — unknown, ask on the next call'}</span>
						<input name="runningSince" type="month" class="input h-11" value={r.runningSince ?? ''} max={data.today.slice(0, 7)} />
					</label>
					<div class="field">
						<span>Last confirmed</span>
						<p class="input flex h-11 items-center {confirmedAge == null || confirmedAge > F5_WINDOW_DAYS ? 'text-social' : 'text-vetted'}">
							{r.lastConfirmed ? `${shortDate(r.lastConfirmed)} ${r.lastConfirmed.slice(0, 4)}` : 'never'}
						</p>
					</div>
				</div>
				<label class="field"><span>Notes</span><textarea name="notes" rows="3" class="input" placeholder="—" bind:value={fields.notes}></textarea></label>
			</section>
		</main>

		<aside class="space-y-4">
			<section id="reminders" class="panel scroll-mt-4 {data.reminders.some((x) => x.due && x.due < data.today) ? 'border-energy/50' : ''}">
				<h3 class="panel-title mb-2">You asked yourself to</h3>
				<Reminders items={data.reminders} today={data.today} subject={{ kind: 'residency', id: data.residency.id, label: `${data.residency.eventName} · ${data.residency.venue.name}` }} />
			</section>
			<section class="panel">
				<h3 class="panel-title mb-3">How a week shows it</h3>
				<div class="rounded-md border border-l-4 border-line bg-ink/40 p-3 {REGISTER_EDGE[fields.register]} {r.active ? '' : 'opacity-50'}">
					<p class="font-mono text-[10px] tracking-wider text-dim">{dayHeading(night)}</p>
					<p class="font-semibold">{fields.eventName}</p>
					<p class="text-xs text-dim">{r.venue.name}{fields.lineup.length ? ` · ${billingLine}` : ''}</p>
					{#if shown.length}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each shown as p, i (i)}
								{@const ending = !!p.activeUntil && p.activeUntil <= weekEnd}
								<span class="rounded border px-1.5 py-px font-mono text-[10px] {ending ? 'border-social/60 text-social' : 'border-line text-fg/80'}">
									{p.label.trim().toLowerCase()}{p.condition.trim() ? ` · ${p.condition.trim()}` : ''}
								</span>
							{/each}
						</div>
					{/if}
				</div>
				<p class="mt-3 text-xs text-dim">
					{#if !r.active}Stopped, so it shows on no week. {/if}Perks are filtered against <strong class="text-fg">that row’s date</strong>, not
					today — so one expiring Thursday shows on Wednesday and not on Saturday, inside the same week you’re assembling.
				</p>
			</section>

			<CallPanel
				kind={r.organiser ? 'organiser' : 'venue'}
				id={r.organiser?.id ?? r.venue.id}
				who={r.organiser ? 'ORGANISER' : 'VENUE'}
				name={r.organiser ? `${r.organiser.contactName ?? r.organiser.name}${r.organiser.contactName ? ` · ${r.organiser.name}` : ''}` : r.venue.name}
				phone={r.organiser ? r.organiser.phone : r.venue.phone}
				whatsapp={r.organiser ? r.organiser.whatsapp : r.venue.whatsapp}
				href="/calls/{r.venue.id}?ref={r.id}"
			>
				{#if r.organiser}
					{r.organiser.name} runs this night, so they own the fact — not {r.venue.name}. The promoter owns the night; the venue
					owns the room.
				{:else}
					No organiser on this night, so the venue owns the fact. A manager’s “I think so?” is worse than no answer, because
					it gets recorded as one.
				{/if}
			</CallPanel>

			<section class="panel">
				<h3 class="panel-title mb-2">Why perks matter here</h3>
				<p class="text-xs text-fg/80">
					They are often what makes a mood legible. <em>“Quiet terrace, half-price wine till 8”</em> is the Chill pitch more than
					any category tag is — and Chill is currently {data.supply.chill === 0 ? 'zero' : data.supply.chill} across all
					{many(data.supply.standing)} standing nights.
				</p>
			</section>
		</aside>
	</div>
</form>
