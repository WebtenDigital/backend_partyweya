<script lang="ts" module>
	export type ReminderItem = {
		id: string;
		body: string;
		due: string | null;
		inherited: boolean;
		subject: { kind: string; id: string; label: string; href: string };
	};
	export type SubjectOption = { kind: string; id: string; label: string; hint: string; also: string[] };
</script>

<script lang="ts">
	// Reminders where they're actionable: a list with a tick that clears one in
	// place, and "+ Add a reminder". On a record the subject is fixed; on the
	// queue the form asks for the subject first — a reminder with no subject
	// isn't register work, and asking first makes that felt, not just enforced.
	import { daysBetween, shortDate } from '#lib/build/week.js';
	import { reminderAction } from '#lib/reminders.js';

	let {
		items,
		today,
		subject = null, //       set on a record: the subject is locked
		subjects = [], //        on the queue: one search box across venues, acts, organisers
		showSubject = !subject,
		addLabel = '+ Add a reminder'
	}: {
		items: ReminderItem[];
		today: string;
		subject?: { kind: string; id: string; label: string } | null;
		subjects?: SubjectOption[];
		showSubject?: boolean;
		addLabel?: string;
	} = $props();

	let adding = $state(false);
	let saving = $state(false);
	let error = $state<{ field: string | null; text: string } | null>(null);
	let picked = $state<SubjectOption | null>(null);
	let query = $state('');
	let active = $state(0);
	let body = $state('');
	let bodyEl = $state<HTMLInputElement | null>(null);
	let dueOn = $state('');
	let clearing = $state<Set<string>>(new Set());

	async function done(id: string) {
		clearing = new Set([...clearing, id]);
		await reminderAction('done', { id });
	}
	async function save() {
		saving = true;
		error = null;
		const result = await reminderAction('add', { subject: target ? `${target.kind}:${target.id}` : '', body, dueOn });
		saving = false;
		if (result.type === 'failure') {
			error = { field: (result.data?.field as string) ?? null, text: String(result.data?.error ?? 'Not saved') };
			return;
		}
		if (result.type === 'error') return void (error = { field: null, text: 'The save failed. Nothing was written.' });
		body = '';
		dueOn = '';
		picked = null;
		adding = false;
	}
	// Inside a page that is itself a form, Enter must save the reminder, not the page.
	const enterSaves = (e: KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), save());

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];
		return subjects
			.filter((s) => s.label.toLowerCase().includes(q) || s.also.some((a) => a.toLowerCase().includes(q)))
			.slice(0, 7);
	});
	const target = $derived(subject ?? picked);

	function pick(s: SubjectOption) {
		picked = s;
		query = '';
		error = null;
		setTimeout(() => bodyEl?.focus());
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') e.preventDefault(); // never submit an enclosing page form
		if (!matches.length) return;
		if (e.key === 'ArrowDown') (e.preventDefault(), (active = (active + 1) % matches.length));
		else if (e.key === 'ArrowUp') (e.preventDefault(), (active = (active - 1 + matches.length) % matches.length));
		else if (e.key === 'Enter') pick(matches[active]);
	}

	function dueText(r: ReminderItem) {
		if (!r.due) return { text: 'no date', tone: 'text-dim' };
		const d = daysBetween(today, r.due);
		const when = r.inherited ? 'on the night' : shortDate(r.due);
		if (d < 0) return { text: `overdue ${-d}d · ${when}`, tone: 'text-energy font-semibold' };
		if (d === 0) return { text: `today · ${when}`, tone: 'text-social' };
		return { text: when, tone: d <= 2 ? 'text-social' : 'text-dim' };
	}
	const KIND: Record<string, string> = { venue: 'VENUE', act: 'ACT', organiser: 'ORGANISER', residency: 'NIGHT', occurrence: 'NIGHT' };
</script>

<div class="space-y-1.5">
	{#each items as r (r.id)}
		{@const due = dueText(r)}
		<div
			class="flex items-start gap-2.5 rounded-md border bg-ink/40 px-2.5 py-2 text-sm {due.tone.includes('energy') ? 'border-energy/50' : 'border-line'} {clearing.has(r.id) ? 'opacity-40' : ''}"
		>
			<button
				type="button"
				onclick={() => done(r.id)}
				disabled={clearing.has(r.id)}
				class="mt-0.5 size-5 shrink-0 rounded border border-dim hover:border-vetted hover:bg-vetted/20"
				aria-label="Mark done: {r.body}"
				title="Done"
			></button>
			<div class="min-w-0 flex-1">
				<p class="text-fg">{r.body}</p>
				<p class="font-mono text-[10px] tracking-wide">
					<span class={due.tone}>{due.text}</span>
					{#if showSubject}
						<span class="text-dim">&nbsp;·&nbsp;</span><a href={r.subject.href} class="text-dim hover:text-fg hover:underline"
							><span class="text-dated">{KIND[r.subject.kind]}</span> {r.subject.label}</a
						>
					{/if}
				</p>
			</div>
		</div>
	{/each}

	{#if !adding}
		<button
			type="button"
			class="h-9 w-full rounded-md border border-dashed border-line px-3 text-left text-xs text-dim hover:border-dim hover:text-fg"
			onclick={() => ((adding = true), (error = null))}>{addLabel}</button
		>
	{:else}
		<div class="space-y-2 rounded-md border border-line bg-ink/40 p-2.5">
			{#if subject}
				<p class="font-mono text-[10px] tracking-wider text-dim">ABOUT <span class="text-fg">{subject.label}</span></p>
			{:else if picked}
				<p class="flex items-center gap-2 font-mono text-[10px] tracking-wider text-dim">
					ABOUT <span class="text-dated">{KIND[picked.kind]}</span><span class="text-fg">{picked.label}</span>
					<button type="button" class="text-dim hover:text-energy" onclick={() => (picked = null)} aria-label="Change what it's about">change</button>
				</p>
			{:else}
				<div class="relative">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="input h-10 text-sm {error?.field === 'subject' ? 'border-energy' : ''}"
						placeholder="First: what's it about? A venue, an act or an organiser"
						bind:value={query}
						onkeydown={onKey}
						oninput={() => (active = 0)}
						autocomplete="off"
						autofocus
						aria-label="What the reminder is about"
					/>
					{#if matches.length}
						<ul class="absolute inset-x-0 top-11 z-10 overflow-hidden rounded-md border border-line bg-panel shadow-lg">
							{#each matches as s, i (s.kind + s.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between px-3 py-2 text-left text-sm {i === active ? 'bg-chill/10' : 'hover:bg-line/40'}"
										onmousedown={(e) => (e.preventDefault(), pick(s))}
									>
										<span>{s.label}</span><span class="font-mono text-[10px] tracking-wider text-dim">{s.hint}</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else if query.trim().length >= 2}
						<p class="mt-1 text-[11px] text-dim">Nothing in the register by that name. A reminder has to hang off something that is.</p>
					{/if}
				</div>
			{/if}
			<input
				bind:this={bodyEl}
				bind:value={body}
				onkeydown={enterSaves}
				class="input h-10 text-sm {error?.field === 'body' ? 'border-energy' : ''}"
				placeholder="Get the flyer from The Clan Band"
				aria-label="What you need to do"
				disabled={!target}
			/>
			<div class="flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-2 font-mono text-[10px] text-dim">
					DUE <input type="date" bind:value={dueOn} onkeydown={enterSaves} class="input h-9 w-auto font-mono text-xs" disabled={!target} />
				</label>
				{#if target?.kind === 'residency' || target?.kind === 'occurrence'}
					<span class="text-[11px] text-dim">blank = the night itself</span>
				{/if}
				<span class="flex-1"></span>
				<button type="button" class="btn h-9 text-xs" onclick={() => ((adding = false), (error = null), (picked = null))}>Cancel</button>
				<button type="button" class="btn-primary h-9 text-xs" disabled={saving} onclick={save}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
			{#if error}<p class="text-xs text-energy">{error.text}</p>{/if}
		</div>
	{/if}
</div>
