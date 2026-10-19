<script lang="ts">
	import HomeLogo from '#lib/components/HomeLogo.svelte';
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
	const stopped = $derived(data.rows.filter((r) => r.state === 'stopped'));
	// Stopped nights aren't gaps: nobody needs to fix them.
	const gaps = $derived(data.rows.filter((r) => r.state !== 'publishable' && r.state !== 'stopped'));
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
	const weakest = $derived(
		[...REGISTERS].sort((a, b) => data.gate.registers[a] - data.gate.registers[b])[0]
	);

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
			<a href="/calls?week={data.week}" class="btn">Call round</a>
			<a href="/venues" class="btn">Venues</a>
			<a href="/acts" class="btn">Acts</a>
			<a href="/add" class="btn" title="Add to the register">+ Add</a>
			<button
				class="btn-primary"
				disabled
				title={data.gate.publishable ? 'The round-up step is not built yet' : 'The Sunday gate has not passed'}
			>
				Build round-up
			</button>
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
				{#if stopped.length}· <span class="text-energy/80">{stopped.length} stopped</span>{/if}
				<span class="ml-3 inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm border border-line bg-panel"></span>standing</span>
				<span class="ml-2 inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm border border-dated/40 bg-dated/20"></span><span class="text-dated">dated</span></span>
				<span class="ml-2 inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm border border-dashed border-energy/50 bg-energy/10"></span><span class="text-energy/80">stopped</span></span>
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
									{r.state === 'stopped'
										? 'border-dashed border-energy/40 bg-energy/[0.05] text-energy/80'
										: r.kind === 'STANDING' ? 'border-line bg-panel' : 'border-dated/50 bg-dated/[0.14]'}
									{live && r.register ? `border-l-4 ${REGISTER_EDGE[r.register]}` : r.state === 'stopped' ? 'border-l-4 border-l-energy/40' : 'border-l-4 border-l-line'}
									{live || r.state === 'stopped' || r.key === highlight ? '' : 'opacity-60'}
									{r.key === highlight ? 'ring-2 ring-chill ring-offset-2 ring-offset-ink' : ''}"
							>
								<div class="col-span-2 min-w-0 md:col-span-1">
									<p class="flex flex-wrap items-center gap-2">
										<a href={editor} class="font-semibold hover:underline">{r.eventName}</a>
										<span
											class="rounded border px-1.5 py-px font-mono text-[10px] tracking-wider
												{r.state === 'stopped' ? 'border-energy/50 text-energy' : r.kind === 'STANDING' ? 'border-line text-dim' : 'border-dated/60 text-dated'}"
										>
											{r.state === 'stopped' ? 'STOPPED' : r.kind}
										</span>
									</p>
									<p class="mt-0.5 {r.state === 'stopped' ? '' : 'text-fg/70'}">{r.venue.name}</p>
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
									{#if r.state === 'stopped'}
										<p>STOPPED</p>
										<p class="opacity-80">not published · reactivate on its record</p>
									{:else if r.state === 'lead'}
										<p class="text-dim">LEAD</p>
									{:else if r.state === 'changed'}
										<p class="text-social">CHANGED</p>
									{:else}
										<p class={r.claimType === 'VETTED' ? 'text-vetted' : 'text-fg/70'}>
											{r.claimType ?? 'NO CLAIM'}
										</p>
									{/if}
									<p class="text-dim">{claimLine(r).join(' · ')}</p>
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
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<section class="panel">
				<h3 class="panel-title mb-3">Register balance</h3>
				{#each REGISTERS as reg (reg)}
					<div class="mb-2">
						<div class="flex justify-between font-mono text-[11px] tracking-wider uppercase">
							<span class={REGISTER_TONE[reg].split(' ')[0]}>{REGISTER_LABEL[reg]}</span>
							<span class={data.gate.registers[reg] ? '' : 'text-energy'}>{data.gate.registers[reg]}</span>
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
				<p class="mt-2 border-t border-line pt-2 text-xs text-fg/80">
					Point this week’s discovery attendance at <span class="text-chill">{REGISTER_LABEL[weakest]}</span>.
					It stocks the carousel <strong>after</strong> next — the attendance clock runs a week ahead of
					this screen.
				</p>
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
