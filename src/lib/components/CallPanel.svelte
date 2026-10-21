<script lang="ts">
	// "Who to call about this": a call is an event, not an edit, so the only way
	// forward from here is a link to the call screen. With no number on file the
	// panel takes one — and saving it writes the number only, never the cadence.
	import type { Snippet } from 'svelte';
	import { savePhone, type ContactKind } from '#lib/contacts.js';

	interface Props {
		// 'booking' is a number on the night itself: nobody to save a number onto.
		kind: ContactKind | 'booking';
		id: string;
		who: string; // the label: VENUE · ORGANISER · UNKNOWN · ACT
		name: string;
		role?: string | null;
		phone: string | null;
		whatsapp?: boolean;
		href: string;
		action?: string;
		/** Under the name: the venue, demoted, on a promoter's night; where an unknown number came from. */
		secondary?: string | null;
		children?: Snippet;
	}
	let { kind, id, who, name, role = null, phone, whatsapp = false, href, action = 'Call about this night →', secondary = null, children }: Props = $props();

	// No `name` attributes: the panel can sit inside a record's own form, and these must not ride along with its save.
	let typed = $state('');
	let wa = $state(false);
	let saving = $state(false);
	let error = $state('');
	async function save() {
		if (kind === 'booking') return;
		saving = true;
		error = '';
		const result = await savePhone(kind, id, typed, wa);
		saving = false;
		if (result.type === 'failure') error = String(result.data?.error ?? 'The save failed.');
		else if (result.type === 'success') typed = '';
		else if (result.type === 'error') error = 'The save failed. Nothing was written.';
	}
</script>

<section class="panel">
	<h3 class="panel-title mb-3">Who to call about this</h3>
	<div class="rounded-md border border-line bg-ink/40 p-3">
		<div class="flex items-start justify-between gap-2">
			<p class="text-sm">{name}{#if role}<span class="ml-1 font-mono text-[10px] text-dim">{role.toLowerCase()}</span>{/if}</p>
			<span class="font-mono text-[10px] tracking-wider {who === 'ORGANISER' ? 'text-dated' : who === 'UNKNOWN' ? 'text-social' : 'text-dim'}">{who}</span>
		</div>
		{#if secondary}<p class="text-xs text-dim">{secondary}</p>{/if}
		{#if phone}
			<p class="font-mono text-xs text-fg">
				{phone}{#if whatsapp}<span class="ml-2 rounded border border-vetted/50 px-1 text-[10px] text-vetted" title="On WhatsApp">wa</span>{/if}
			</p>
		{:else}
			<p class="font-mono text-xs text-social">no number on file</p>
			<div class="mt-2 flex gap-2">
				<input
					type="tel"
					class="input h-10 min-w-0 flex-1 font-mono text-sm"
					placeholder="0772 123456"
					aria-label="Number for {name}"
					bind:value={typed}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							if (typed.trim()) save();
						}
					}}
				/>
				<button type="button" class="btn h-10 shrink-0" disabled={saving || !typed.trim()} onclick={save}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
			<label class="mt-2 flex items-center gap-2 text-xs text-dim"><input type="checkbox" class="size-4" bind:checked={wa} /> On WhatsApp</label>
			{#if error}<p class="mt-2 text-xs text-energy">{error}</p>{/if}
			<p class="mt-2 text-[11px] text-dim">Saving the number isn’t a call — it stays unverified and the next-call date doesn’t move.</p>
		{/if}
	</div>
	{#if phone}
		<a {href} class="btn-primary mt-3 flex h-11 items-center justify-center">{action}</a>
	{:else}
		<button type="button" class="btn-primary mt-3 h-11 w-full cursor-not-allowed opacity-40" disabled title="Add a number first">{action}</button>
	{/if}
	{#if children}<div class="mt-3 text-xs text-dim">{@render children()}</div>{/if}
</section>
