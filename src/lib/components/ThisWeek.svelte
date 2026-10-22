<script lang="ts">
	// The header button to "This week" (/calls), carrying the count of what is
	// blocking or overdue right now (owedNow, from the app layout). At zero there
	// is no badge at all: a grey 0 is a number that stops being read. Not shown
	// on /calls itself — there you're looking at the list.
	import { page } from '$app/state';

	let { href = '/calls' }: { href?: string } = $props();
	const owed = $derived((page.data.owedNow as number | undefined) ?? 0);
</script>

<a {href} class="btn inline-flex items-center gap-2" title={owed ? `${owed} blocking or overdue right now` : undefined}>
	This week
	{#if owed > 0}
		<span class="rounded-full bg-energy px-1.5 py-0.5 font-mono text-[11px] leading-none font-semibold text-ink" aria-label="{owed} blocking or overdue">{owed}</span>
	{/if}
</a>
