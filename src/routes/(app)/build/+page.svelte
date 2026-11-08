<script lang="ts">
	import { attendanceVerdict, vouchExpiry, vouchState } from '#lib/build/vouch.js';
	import HomeLogo from '#lib/components/HomeLogo.svelte';
	import ThisWeek from '#lib/components/ThisWeek.svelte';
	import Visits from '#lib/components/Visits.svelte';
	import NewActsPrompt from '#lib/components/NewActsPrompt.svelte';
	import {
		REGISTERS,
		addDays,
		dayHeading,
		maskPhone,
		shillings,
		shortDate,
		type Register,
		type Row
	} from '#lib/build/week.js';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { reminderAction } from '#lib/reminders.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const REGISTER_LABEL: Record<Register, string> = {
		CHILL: 'Chill',
		SOCIAL: 'Social',
		HIGH_ENERGY: 'High-Energy'
	};
	const REGISTER_TONE: Record<Register, string> = {
		CHILL: 'text-chill border-chill/50',
		SOCIAL: 'text-social border-social/50',
		HIGH_ENERGY: 'text-energy border-energy/50'
	};
	const REGISTER_EDGE: Record<Register, string> = {
		CHILL: 'border-l-chill',
		SOCIAL: 'border-l-social',
		HIGH_ENERGY: 'border-l-energy'
	};
	const REGISTER_BAR: Record<Register, string> = {
		CHILL: 'bg-chill',
		SOCIAL: 'bg-social',
		HIGH_ENERGY: 'bg-energy'
	};

	const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function title(start: string, end: string) {
		const [, sm, sd] = start.split('-').map(Number);
		const [, em, ed] = end.split('-').map(Number);
		const dow = (d: string) => DAY_SHORT[new Date(`${d}T00:00:00Z`).getUTCDay()];
		const left = sm === em ? `${dow(start)} ${sd}` : `${dow(start)} ${shortDate(start)}`;
		return `${left} – ${dow(end)} ${ed} ${MONTHS_LONG[em - 1]}`;
	}

	const days = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const date = addDays(data.week, i);
			return { date, rows: data.rows.filter((r) => r.date === date) };
		})
	);

	const pub = $derived(data.rows.filter((r) => r.state === 'publishable'));
	const heldBack = $derived(data.rows.filter((r) => r.state === 'needs-time'));
	const leads = $derived(data.rows.filter((r) => r.state === 'lead'));
	const changed = $derived(data.rows.filter((r) => r.state === 'changed'));
	const gaps = $derived(data.rows.filter((r) => r.state !== 'publishable'));
	const failing = $derived(data.gate.checks.filter((c) => c.pass === false));

	const zones = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of pub) {
			const z = r.venue.zone ?? 'Unzoned';
			counts.set(z, (counts.get(z) ?? 0) + 1);
		}
		return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	});
	const divisions = $derived(new Set(pub.map((r) => r.venue.division).filter(Boolean)).size);
	const crowded = $derived(zones.find(([, n]) => n >= 5));
	const maxRegister = $derived(Math.max(1, ...REGISTERS.map((r) => data.gate.registers[r])));
	// Where Friday's attendance goes: decided once, in vouch.ts (attendanceTarget) — count, then freshness.
	const weakest = $derived(data.attendance.target);
	const need = $derived(Object.fromEntries(data.attendance.registers.map((n) => [n.register, n])) as Record<Register, (typeof data.attendance.registers)[number]>);

	function claimLine(r: Row) {
		if (r.state === 'lead') return [r.source ?? 'no source', r.checkedOn ? shortDate(r.checkedOn) : 'uncalled'];
		return [r.source ?? 'no source', r.checkedOn ? shortDate(r.checkedOn) : 'undated'];
	}

	function gapReason(r: Row) {
		if (r.state === 'needs-time') return 'confirmed, needs a time';
		if (r.state === 'changed') return 'details moved — re-verify';
		return r.missing.length ? `needs ${r.missing.join(' + ')}` : 'needs a call';
	}

	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

	// Arriving from “Add to the register”: show the row that was just written.
	const highlight = $derived(page.url.searchParams.get('highlight'));
	$effect(() => {
		if (highlight) document.getElementById(`row-${highlight}`)?.scrollIntoView({ block: 'center' });
	});
</script>

<svelte:head>
	<title>Sunday Build · {title(data.week, data.weekEnd)}</title>
</svelte:head>

<div class="min-h-screen bg-ink text-fg">
	<header class="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
		<div class="flex items-center gap-5">
			<HomeLogo week={data.currentWeek} />
			<div>
				<p class="font-mono text-[11px] tracking-[0.2em] text-dim uppercase">Sunday build</p>
				<h1 class="mt-1 text-2xl font-semibold tracking-tight">{title(data.week, data.weekEnd)}</h1>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 text-sm">
			<a href="/build?week={addDays(data.week, -7)}" class="btn">← Previous week</a>
			<a href="/build?week={addDays(data.week, 7)}" class="btn">Next week →</a>
			<ThisWeek href="/calls?week={data.week}" />
			<a href="/venues" class="btn">Venues</a>
			<a href="/acts" class="btn">Acts</a>
			<Visits />
			<a href="/add" class="btn" title="Add to the register">+ Add</a>
			<!-- The gate is not advisory: no pass, no button. Building writes nothing — publishing is a later step. -->
			{#if data.gate.publishable}
				<a href="/build/roundup?week={data.week}" class="btn-primary inline-flex items-center">Build round-up</a>
			{:else}
				<button class="btn-primary" disabled title="The Sunday gate has not passed">Build round-up</button>
			{/if}
			<form method="POST" action="/login?/logout">
				<button class="btn text-dim">Log out</button>
			</form>
		</nav>
	</header>

	{#if data.newActs.length}
		<div class="mx-4 mt-4 rounded-md border border-line bg-panel px-4 py-2 sm:mx-6"><NewActsPrompt names={data.newActs} /></div>
	{/if}
	{#if !data.gate.publishable && data.rows.length}
		<div class="mx-4 mt-5 rounded-md border border-energy/40 bg-energy/10 px-4 py-3 text-sm sm:mx-6">
			<p class="font-semibold"><span class="mr-2 text-energy">!</span>This set is not publishable as a round-up.</p>
			<p class="mt-1 text-fg/80">
				{#if pub.length === 0}
					Nothing in this week has cleared confirmation, a start time and a register yet.
				{:else}
					{plural(failing.length, 'check')} {failing.length === 1 ? 'fails' : 'fail'}. Publishing anyway
					would mean padding to a number or claiming range the week does not have — both are Rule F2
					(the quality gate) violations.
				{/if}
			</p>
		</div>
	{/if}

	<div class="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<main class="min-w-0">
			<p class="mb-4 font-mono text-xs text-dim">
				{plural(data.rows.length, 'row')} ·
				<span class="text-vetted">{pub.length} publishable</span>
				{#if heldBack.length}· <span class="text-social">{heldBack.length} confirmed, no time</span>{/if}
				{#if leads.length}· {plural(leads.length, 'lead')}{/if}
				{#if changed.length}· {changed.length} changed{/if}
				<span class="ml-3 inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm border border-line bg-panel"></span>standing</span>
				<span class="ml-2 inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm border border-dated/40 bg-dated/20"></span><span class="text-dated">dated</span></span>
			</p>

			{#each days as day (day.date)}
				<section class="mb-7">
					<div class="mb-2 flex items-center gap-3 font-mono text-xs">
						<h2 class="font-semibold tracking-wider">{dayHeading(day.date)}</h2>
						<span class="h-px flex-1 bg-line"></span>
						{#if day.rows.length}<span class="text-dim">{plural(day.rows.length, 'entry', 'entries')}</span>{/if}
					</div>

					{#if day.rows.length === 0}
						<p class="rounded-md border border-dashed border-line px-4 py-3 text-sm text-dim">
							Nothing in the register. Honest gap — not a slot to fill.
						</p>
					{/if}

					<div class="space-y-2">
						{#each day.rows as r (r.key)}
							{@const live = r.state === 'publishable'}
							{@const editor = r.kind === 'STANDING' ? `/residencies/${r.key.split('|')[0]}` : `/occurrences/${r.key}`}
							<article
								id="row-{r.key}"
								class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border px-4 py-3 text-sm md:grid-cols-[minmax(0,1.6fr)_90px_90px_90px_110px_minmax(0,1.2fr)] md:items-center
									{r.kind === 'STANDING' ? 'border-line bg-panel' : 'border-dated/50 bg-dated/[0.14]'}
									{live && r.register ? `border-l-4 ${REGISTER_EDGE[r.register]}` : 'border-l-4 border-l-line'}
									{live || r.key === highlight ? '' : 'opacity-60'}
									{r.key === highlight ? 'ring-2 ring-chill ring-offset-2 ring-offset-ink' : ''}"
							>
								<div class="col-span-2 min-w-0 md:col-span-1">
									<p class="flex flex-wrap items-center gap-2">
										<a href={editor} class="font-semibold hover:underline">{r.eventName}</a>
										<span
											class="rounded border px-1.5 py-px font-mono text-[10px] tracking-wider
												{r.kind === 'STANDING' ? 'border-line text-dim' : 'border-dated/60 text-dated'}"
										>
											{r.kind}
										</span>
									</p>
									<p class="mt-0.5 text-fg/70">{r.venue.name}</p>
									<p class="font-mono text-[10px] tracking-wider text-dim">{r.venue.zone ?? 'UNZONED'}</p>
									{#if r.billing}<p class="mt-1 text-xs text-fg/80">{r.billing}</p>{/if}
									<div class="mt-1 flex flex-wrap items-center gap-1">
										{#each r.perks as p, i (i)}
												{@const ending = p.activeUntil != null && p.activeUntil <= data.weekEnd}
												<span
													class="rounded border px-1.5 py-px font-mono text-[10px] {ending ? 'border-line text-dim' : 'border-vetted/40 text-vetted'}"
													title={ending ? 'Ends this week — check before it publishes' : ''}
												>
													{p.kind} · {p.label}{p.condition ? ` · ${p.condition}` : ''}{ending ? ` · ends ${dayHeading(p.activeUntil!).toLowerCase()}` : ''}
												</span>
											{/each}
										<a
											href="{editor}#offers"
											class="rounded border border-dashed border-line px-1.5 py-px font-mono text-[10px] text-dim hover:border-vetted hover:text-vetted"
											title={r.kind === 'STANDING' ? 'Offers on this standing night, every week' : 'Offers for this date only'}
										>
											{r.perks.length ? 'edit offers' : '+ offer'}
										</a>
									</div>
									{#each data.reminders.filter((m) => (r.residencyId && m.residencyId === r.residencyId) || (r.kind !== 'STANDING' && m.occurrenceId === r.key)) as m (m.id)}
										{@const late = !!m.due && m.due < data.today}
										<p class="mt-1 flex items-center gap-2 text-xs">
											<button type="button" onclick={() => reminderAction('done', { id: m.id })} class="size-4 shrink-0 rounded border border-dim hover:border-vetted hover:bg-vetted/20" aria-label="Mark done: {m.body}" title="Done"></button>
											<span class={late ? 'text-energy' : 'text-fg/80'}>{m.body}</span>
											{#if m.due}<span class="font-mono text-[10px] {late ? 'text-energy' : 'text-dim'}">{late ? 'overdue · ' : ''}{shortDate(m.due)}</span>{/if}
										</p>
									{/each}
								</div>

								<div class="font-mono">
									{#if r.startTime}
										{r.startTime}
									{:else if r.state === 'needs-time'}
										<span class="text-social">needs time</span>
									{:else}
										<span class="text-dim">no time</span>
									{/if}
								</div>

								<div class="font-mono">
									{shillings(r.priceGate)}
									{#if r.usualPrice != null}
										<span class="block text-[10px] text-dim">usually {shillings(r.usualPrice)}</span>
									{:else if r.extraTiers}
										<span class="block text-[10px] text-dim">+{plural(r.extraTiers, 'tier')}</span>
									{/if}
								</div>

								<div class="font-mono text-[11px] tracking-wider text-dim">{r.category.replaceAll('_', ' ')}</div>

								<div>
									{#if r.register}
										<span
											class="inline-block rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase
												{live ? REGISTER_TONE[r.register] : 'border-line text-dim'}"
										>
											{REGISTER_LABEL[r.register]}
										</span>
									{:else}
										<span class="font-mono text-[10px] text-dim">no register</span>
									{/if}
								</div>

								<div class="col-span-2 font-mono text-[11px] leading-snug md:col-span-1">
									{#if r.state === 'lead'}
										<p class="text-dim">LEAD</p>
									{:else if r.state === 'changed'}
										<p class="text-social">CHANGED</p>
									{:else}
										<p class={r.claimType === 'VETTED' ? 'text-vetted' : 'text-fg/70'}>
											{r.claimType ?? 'NO CLAIM'}
										</p>
									{/if}
									<p class="text-dim">{claimLine(r).join(' · ')}</p>
									<!-- Rule F2: listable, never recommended. Visible so it can't be featured by accident. -->
									{#if r.clearsF2 === false}<p class="font-semibold text-energy" title="Judged in the room: doesn’t clear the quality gate">DOESN’T CLEAR · listing only</p>{/if}
									{#if r.attendedAt}
										{@const vs = vouchState(r.attendedAt, data.week)}
										<p class={vs === 'LIVE' ? 'text-vetted/80' : vs === 'EXPIRING' ? 'text-social' : 'text-energy'}>
											{vs.toLowerCase()} · {vouchExpiry(r.attendedAt, data.today)}
										</p>
									{/if}
									<!-- No "I was here" link on a summary row. Attendance takes five answers (date, Q6,
									     register, what differed, initials); a one-tap link beside a dense row invites a
									     vouch logged without them. It lives in "Were you there?" on the night's record. -->
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/each}
		</main>

		<aside class="space-y-4">
			<section class="panel">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="panel-title">The Sunday gate</h3>
					<span class="font-mono text-xs {data.gate.publishable ? 'text-vetted' : 'text-energy'}">
						{data.gate.passed} / {data.gate.total}
					</span>
				</div>
				<ul class="space-y-3 text-sm">
					{#each data.gate.checks as c (c.label)}
						<li class="flex gap-3 {c.pass === null ? 'opacity-50' : ''}">
							<span class="w-3 font-mono {c.pass ? 'text-vetted' : c.pass === false ? 'text-energy' : 'text-dim'}">
								{c.pass ? '✓' : c.pass === false ? '✕' : '–'}
							</span>
							<div>
								<p>{c.label}</p>
								<p class="text-xs text-dim">{c.detail}</p>
								{#if c.forecast}<p class="font-mono text-[11px] text-vetted/80">{c.forecast}</p>{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<section class="panel">
				<h3 class="panel-title mb-3">Register balance</h3>
				{#each REGISTERS as reg (reg)}
					{@const n = need[reg]}
					<div class="mb-2">
						<div class="flex justify-between gap-2 font-mono text-[11px] tracking-wider uppercase">
							<span class={REGISTER_TONE[reg].split(' ')[0]}>{REGISTER_LABEL[reg]}</span>
							<span class="normal-case">
								<span class={data.gate.registers[reg] ? '' : 'text-energy'}>{data.gate.registers[reg]} night{data.gate.registers[reg] === 1 ? '' : 's'}</span>
								<span class="text-dim"> · {n.daysSince == null ? 'never attended' : `${n.daysSince}d since attended`}</span>
							</span>
						</div>
						<div class="mt-1 h-1.5 rounded bg-line">
							<div
								class="h-full rounded {REGISTER_BAR[reg]}"
								style="width: {(data.gate.registers[reg] / maxRegister) * 100}%"
							></div>
						</div>
					</div>
				{/each}
				<p class="mt-3 text-xs text-fg/80">
					{#if data.gate.checks[1].pass}
						All three present, so Rule F4 (mood balance) is met.
						{#if data.gate.registers[weakest] === 1}{REGISTER_LABEL[weakest]} rests on one entry.{/if}
					{:else if pub.length === 0}
						Nothing publishable yet, so no register is represented.
					{:else}
						No {REGISTERS.filter((r) => !data.gate.registers[r]).map((r) => REGISTER_LABEL[r]).join(' or ')}
						at all. Do not relabel something to fill it — a mislabelled entry corrupts Rule F4’s counts
						and teaches the vocabulary wrong.
					{/if}
				</p>
				<!-- The verdict: count leads, freshness breaks ties. Live vouches are not in it. -->
				<p class="mt-2 border-t border-line pt-2 text-sm {data.attendance.reason === 'absent' ? 'text-energy' : ''}">
					{attendanceVerdict(data.attendance)}
				</p>
				<p class="mt-1 text-xs text-fg/80">
					It stocks the carousel <strong>after</strong> next — the attendance clock runs a week ahead of
					this screen.
				</p>

				<!-- The week's one visit. Planned: show the decision, with change and dismiss.
				     Not yet: the target register's nights to plan it at. Never both. -->
				<div class="mt-3 border-t border-line pt-2 text-xs">
					{#if page.form?.visitError}<p class="mb-1 text-energy">{page.form.visitError}</p>{/if}
					{#if data.visit}
						{@const v = data.visit}
						<p class="font-mono text-[10px] tracking-wider text-chill uppercase">Visit planned</p>
						<p class="text-sm">
							{dayHeading(v.date)} · {v.venue.name} — {v.eventName}{v.startTime ? ` · ${v.startTime}` : ''}
							{#if v.writtenUp}<span class="text-vetted"> · written up ✓</span>{/if}
						</p>
						{#if !v.writtenUp}
							<div class="mt-1 flex flex-wrap items-center gap-2">
								{#if v.date <= data.today}<a href={v.href} class="btn-primary inline-flex h-9 items-center text-xs">Write it up</a>{/if}
								<form method="POST" action="?/dismiss" use:enhance><input type="hidden" name="id" value={v.id} /><button class="btn h-9 text-xs">It didn’t happen</button></form>
								<details class="w-full">
									<summary class="cursor-pointer text-dim hover:text-fg">Change the night</summary>
									<ul class="mt-1 space-y-1">
										{#each data.visitNights.filter((n) => !(n.ref === v.ref && n.date === v.date)) as n (n.ref + n.date)}
											<li>
												<form method="POST" action="?/change" use:enhance class="flex items-center justify-between gap-2">
													<input type="hidden" name="id" value={v.id} /><input type="hidden" name="ref" value={n.ref} /><input type="hidden" name="date" value={n.date} />
													<span>{dayHeading(n.date)} · {n.venue} — {n.eventName}</span><button class="text-chill hover:underline">move here</button>
												</form>
											</li>
										{/each}
									</ul>
								</details>
							</div>
						{/if}
					{:else if data.visitNights.length}
						<p class="mb-1 font-mono text-[10px] tracking-wider text-dim uppercase">Plan a visit — {REGISTER_LABEL[weakest]} this week</p>
						<ul class="space-y-1">
							{#each data.visitNights as n (n.ref + n.date)}
								<li>
									<form method="POST" action="?/plan" use:enhance class="flex items-center justify-between gap-2">
										<input type="hidden" name="ref" value={n.ref} /><input type="hidden" name="date" value={n.date} /><input type="hidden" name="register" value={weakest} />
										<span>{dayHeading(n.date)} · {n.venue} — {n.eventName}{n.startTime ? ` · ${n.startTime}` : ''}</span>
										<button class="shrink-0 text-chill hover:underline">Plan a visit</button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-dim">No {REGISTER_LABEL[weakest]} night runs this week to plan a visit at.</p>
					{/if}
				</div>

				<!-- The evidence and the action — what the gate checks, never what decides where to go.
				     No call button: a call confirms a night runs; it can't refresh a judgement about a room. -->
				<div class="mt-3 border-t border-line pt-2">
					<p class="mb-2 font-mono text-[10px] tracking-wider text-vetted uppercase">Vouches running out</p>
					<!-- A planned visit that happened and was never written up: the vouch it would have refreshed. -->
					{#each data.unwritten as u (u.id)}
						<a href={u.href} class="mb-2 block rounded-md border border-social/60 bg-social/5 px-3 py-2 text-xs text-social hover:underline">
							{dayHeading(u.date)} · {u.venue.name} — not written up →
						</a>
					{/each}
					{#if !data.vouches.length}
						<p class="text-xs text-dim">Every vouch in this week is live.</p>
					{/if}
					<ul class="space-y-2">
						{#each data.vouches as v (v.ref)}
							<li class="rounded-md border border-l-4 border-line bg-ink/40 px-3 py-2 text-xs {v.state === 'EXPIRED' ? 'border-l-energy' : 'border-l-social'}">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-semibold text-fg">{v.eventName}</p>
										<p class="text-dim">{v.venue}</p>
									</div>
									{#if v.register}<span class="shrink-0 rounded border border-line px-1 font-mono text-[10px] {REGISTER_TONE[v.register].split(' ')[0]}">{REGISTER_LABEL[v.register]}</span>{/if}
								</div>
								<p class="text-dim">attended {shortDate(v.attendedAt)}{v.attendedBy ? ` by ${v.attendedBy}` : ''}</p>
								<p class={v.state === 'EXPIRED' ? 'text-energy' : 'text-social'}>{v.expiry}</p>
								<a href={v.record} class="mt-1 inline-block text-chill underline">Plan a visit · {dayHeading(v.date).toLowerCase()} →</a>
							</li>
						{/each}
					</ul>
				</div>
			</section>

			<!-- "240 venues on file" flatters: this is what the week can actually be built from. -->
			<section class="panel flex items-baseline justify-between gap-3 text-sm">
				<p>
					Venues with a recorded night: <strong>{data.coverage.withNight}</strong> <span class="text-dim">of {data.coverage.venues}</span>
				</p>
				<a href="/calls?week={data.week}" class="shrink-0 font-mono text-xs text-chill hover:underline" title="No night on file, a number to ask on">
					{data.coverage.backlog} to discover →
				</a>
			</section>

			{#if data.gate.registers.CHILL === 0}
				<section class="panel border-energy/40">
					<h3 class="panel-title mb-2 text-energy">Why Chill is zero</h3>
					{#if data.supply.chillNights === 0}
						<p class="mb-3 text-xs">Not a confirmation gap. <strong>There is no Chill supply to confirm.</strong></p>
					{:else}
						<p class="mb-3 text-xs">
							{plural(data.supply.chillNights, 'standing night')} classed Chill, none publishable this week.
						</p>
					{/if}
					<dl class="space-y-1 font-mono text-xs">
						<div class="flex justify-between"><dt>Venues in the register</dt><dd>{data.supply.venues}</dd></div>
						<div class="flex justify-between"><dt>Carrying a standing night</dt><dd>{data.supply.standingVenues}</dd></div>
						<div class="flex justify-between"><dt>Standing nights, all registers</dt><dd>{data.supply.standingNights}</dd></div>
						<div class="flex justify-between"><dt>… classed CHILL</dt><dd class={data.supply.chillNights ? '' : 'text-energy'}>{data.supply.chillNights}</dd></div>
						<div class="flex justify-between">
							<dt>Venues with a conversation test</dt>
							<dd class="text-energy">{data.supply.tested} of {data.supply.venues}</dd>
						</div>
					</dl>
				</section>
			{/if}

			<section class="panel">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="panel-title">Where the week sits</h3>
					<span class="font-mono text-[11px] text-vetted">
						{plural(zones.length, 'zone')} · {plural(divisions, 'division')}
					</span>
				</div>
				{#if zones.length}
					<dl class="space-y-1 font-mono text-xs">
						{#each zones as [zone, n] (zone)}
							<div class="flex justify-between"><dt>{zone}</dt><dd>{n}</dd></div>
						{/each}
					</dl>
				{/if}
				<p class="mt-3 text-xs text-fg/80">
					{#if crowded}
						<span class="text-energy">{crowded[0]} is carrying {crowded[1]}.</span> That concentration is the
						warning (Rule 6, protect the platform’s breadth).
					{:else if pub.length}
						{plural(pub.length, 'entry', 'entries')} across {plural(zones.length, 'zone')}. One zone carrying five
						would be the warning (Rule 6).
					{:else}
						Nothing publishable to place yet.
					{/if}
				</p>
			</section>

			<section class="panel">
				<h3 class="panel-title">Due a call this week</h3>
				<p class="mb-3 text-xs text-dim">From the cadence, not from this week’s gaps.</p>
				{#if data.calls.length === 0}
					<p class="text-xs text-dim">Nobody is due.</p>
				{/if}
				<ul class="space-y-2">
					{#each data.calls as c (c.venue)}
						<li class="flex items-start justify-between gap-3 text-xs">
							<div>
								<a href="/calls/{c.id}?week={data.week}" class="font-semibold hover:underline">{c.venue}</a>
								<p class="text-dim">{c.reasons.join(' · ')}</p>
							</div>
							<span class="shrink-0 rounded border border-line px-2 py-1 font-mono text-chill">{maskPhone(c.phone)}</span>
						</li>
					{/each}
				</ul>
			</section>

			{#if gaps.length}
				<section class="panel">
					<h3 class="panel-title">Gaps in this set</h3>
					<p class="mb-3 text-xs text-dim">Held out of the carousel until they clear. Not failures — Thursday’s work arriving late.</p>
					<ul class="space-y-2">
						{#each gaps as g (g.key)}
							<li class="flex items-start justify-between gap-3 text-xs">
								<div>
									<a href="/calls/{g.venue.id}?{g.kind === 'STANDING' ? `residency=${g.key.split('|')[0]}` : `occurrence=${g.key}`}&week={data.week}" class="font-semibold hover:underline">{g.eventName}</a>
									<p class={g.state === 'needs-time' ? 'text-social' : 'text-dim'}>
										{g.venue.name} · {shortDate(g.date)} · {gapReason(g)}
									</p>
								</div>
								<span class="shrink-0 rounded border border-line px-2 py-1 font-mono text-chill">{maskPhone(g.venue.phone)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if !data.gate.publishable}
				<section class="panel">
					<h3 class="panel-title mb-2">What to do instead</h3>
					<ul class="space-y-2 text-xs text-fg/80">
						{#if pub.length}
							<li><strong class="text-fg">Publish {pub.length}, by night, and say so.</strong> A thin honest week is the system working. The count was never promised.</li>
						{/if}
						{#if data.gate.checks[1].pass === false}
							<li><strong class="text-fg">Run the conversation test on the Thursday round.</strong> Classification is the cheapest fix and nobody has to go anywhere.</li>
						{/if}
						{#if data.gate.checks[2].pass === false || data.gate.checks[1].pass === false}
							<li><strong class="text-fg">Point the discovery attendance at a {REGISTER_LABEL[weakest].toLowerCase()} room.</strong> It will not rescue this week — tonight stocks the carousel after next.</li>
						{/if}
						<li><strong class="text-fg">Do not pad, and do not relabel.</strong> A weak pick is remembered against the one claim the system exists to prove.</li>
					</ul>
				</section>
			{/if}

			{#if pub.length > 5}
				<section class="panel">
					<h3 class="panel-title mb-2">Layout</h3>
					<p class="text-xs text-fg/80">
						{pub.length} entries, so the carousel organises <strong>by night</strong>, each panel carrying its
						register. Above five, night headings are the footholds.
					</p>
				</section>
			{/if}
		</aside>
	</div>
</div>
