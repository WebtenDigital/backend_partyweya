<script lang="ts" module>
	export type Suggestion = { name: string; role: string | null; transfers: boolean | null };
</script>

<script lang="ts">
	// One text field for a lineup: names split on commas as you type and show
	// as chips below, in billing order (the first headlines). Suggestions come
	// from every name already billed, classified or not. At save, a name that
	// looks like an existing one is queried once — the Kirinya / Kirinnya trap.
	import { tick } from 'svelte';
	import { nearMatch, splitLineup } from '#lib/build/acts.js';

	let {
		name = 'lineup',
		value = [],
		names = $bindable([]),
		suggestions = [],
		placeholder = 'The Clan Band, Felicia',
		onresolved = () => {}
	}: {
		name?: string;
		value?: string[];
		names?: string[];
		suggestions?: Suggestion[];
		placeholder?: string;
		onresolved?: () => void; // called when a near-match question is answered, to resume the save
	} = $props();

	// svelte-ignore state_referenced_locally — seeds the field once; the parent re-keys it per record.
	let text = $state(value.join(', '));
	let focused = $state(false);
	let active = $state(0);
	$effect(() => {
		names = splitLineup(text);
	});

	const lookup = (n: string) => suggestions.find((s) => s.name.toLowerCase() === n.trim().toLowerCase());
	const partial = $derived(text.split(',').at(-1)?.trim() ?? '');
	const offered = $derived(
		partial.length < 2
			? []
			: suggestions
					.filter((s) => s.name.toLowerCase().includes(partial.toLowerCase()) && !names.slice(0, -1).some((n) => n.toLowerCase() === s.name.toLowerCase()))
					.slice(0, 6)
	);

	function choose(s: string) {
		const parts = text.split(',');
		parts[parts.length - 1] = ` ${s}`;
		text = parts.join(',').replace(/^\s+/, '') + ', ';
		active = 0;
	}
	function remove(i: number) {
		text = names.filter((_, j) => j !== i).join(', ');
	}
	function onKey(e: KeyboardEvent) {
		if (!offered.length || !focused) return;
		if (e.key === 'ArrowDown') (e.preventDefault(), (active = (active + 1) % offered.length));
		else if (e.key === 'ArrowUp') (e.preventDefault(), (active = (active - 1 + offered.length) % offered.length));
		else if (e.key === 'Enter' || e.key === 'Tab') {
			if (offered[active] && offered[active].name.toLowerCase() !== partial.toLowerCase()) {
				e.preventDefault();
				choose(offered[active].name);
			}
		}
	}

	// ── near-match guard ────────────────────────────────────────────────
	let question = $state<{ name: string; like: string } | null>(null);
	const answered = new Set<string>();

	/** Call before saving. False means a question is showing; the save resumes via onresolved. */
	export function confirm() {
		const known = suggestions.map((s) => s.name);
		for (const n of names) {
			if (answered.has(n.toLowerCase())) continue;
			const like = nearMatch(n, known);
			if (like) {
				question = { name: n, like };
				return false;
			}
		}
		return true;
	}
	async function answer(useExisting: boolean) {
		if (!question) return;
		const { name: typed, like } = question;
		answered.add(typed.toLowerCase());
		answered.add(like.toLowerCase());
		if (useExisting) {
			text = names.map((n) => (n === typed ? like : n)).join(', ');
			names = splitLineup(text); // now, so the save that resumes carries the corrected name
		}
		question = null;
		await tick(); // let the hidden inputs re-render before the form resubmits
		onresolved();
	}
</script>

<div class="relative space-y-2">
	<input type="hidden" name="{name}_sent" value="1" />
	{#each names as n (n)}<input type="hidden" {name} value={n} />{/each}
	<input
		class="input h-11"
		{placeholder}
		bind:value={text}
		onfocus={() => (focused = true)}
		onblur={() => setTimeout(() => (focused = false), 150)}
		onkeydown={onKey}
		autocomplete="off"
		aria-label="Lineup — names separated by commas"
	/>
	{#if focused && offered.length}
		<ul class="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-md border border-line bg-panel shadow-lg">
			{#each offered as s, i (s.name)}
				<li>
					<button
						type="button"
						class="flex w-full items-center justify-between px-3 py-2 text-left text-sm {i === active ? 'bg-chill/10' : 'hover:bg-line/40'}"
						onmousedown={(e) => (e.preventDefault(), choose(s.name))}
					>
						<span>{s.name}</span>
						<span class="font-mono text-[10px] tracking-wider text-dim">{s.role?.replace('_', ' ') ?? 'no role'}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if names.length}
		<div class="flex flex-wrap gap-1.5">
			{#each names as n, i (n)}
				{@const s = lookup(n)}
				<span class="inline-flex items-center gap-1.5 rounded border border-line bg-ink/40 py-0.5 pr-1 pl-2 text-xs">
					{#if i === 0 && names.length > 1}<span class="font-mono text-[9px] text-dim">HEADLINE</span>{/if}
					{n}
					{#if s?.role}<span class="font-mono text-[9px] tracking-wider text-chill">{s.role.replace('_', ' ')}</span>{/if}
					<button type="button" class="px-1 text-dim hover:text-energy" onclick={() => remove(i)} aria-label="Remove {n}">×</button>
				</span>
			{/each}
		</div>
	{/if}
	{#if question}
		<p class="flex flex-wrap items-center gap-2 rounded-md border border-social/50 bg-social/10 px-3 py-2 text-xs">
			<span>“{question.name}” looks like “{question.like}”. Same act?</span>
			<button type="button" class="rounded border border-social/60 px-2 py-1 hover:bg-social/10" onclick={() => answer(true)}>Use the existing one</button>
			<button type="button" class="rounded border border-line px-2 py-1 hover:border-dim" onclick={() => answer(false)}>No, it’s different</button>
		</p>
	{/if}
</div>
