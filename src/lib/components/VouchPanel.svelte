<script lang="ts">
	// Beside "Who to call about this": the other way a night gets confirmed. A call
	// confirms it runs; only being there vouches for the room — and that ages out.
	import { vouchExpiry, vouchState } from '#lib/build/vouch.js';
	import { dayHeading } from '#lib/build/week.js';

	interface Props {
		ref: string;
		attendedAt: string | null;
		attendedBy: string | null;
		today: string;
		week: string; // the build week the state is judged for
		justLogged?: string | null;
	}
	let { ref, attendedAt, attendedBy, today, week, justLogged = null }: Props = $props();
	const state = $derived(vouchState(attendedAt, week));
	const TONE = { NONE: 'text-dim', LIVE: 'text-vetted', EXPIRING: 'text-social', EXPIRED: 'text-energy' } as const;
</script>

<section class="panel">
	<h3 class="panel-title mb-3">Were you there?</h3>
	{#if justLogged}<p class="mb-2 text-xs text-vetted">Vouch logged for {dayHeading(justLogged).toLowerCase()} ✓</p>{/if}
	<div class="rounded-md border border-line bg-ink/40 p-3 text-sm">
		{#if attendedAt}
			<p>Attended {dayHeading(attendedAt).toLowerCase()}{attendedBy ? ` · ${attendedBy}` : ''}</p>
			<p class="font-mono text-xs {TONE[state]}">{state} · {vouchExpiry(attendedAt, today)}</p>
		{:else}
			<p class="text-dim">Never attended — no vouch on this night.</p>
		{/if}
	</div>
	<a href="/attend/{ref}" class="btn mt-3 flex h-11 items-center justify-center">I was here →</a>
	<p class="mt-2 text-xs text-dim">A call can’t renew a vouch: it confirms the night runs, not what the room is like.</p>
</section>
