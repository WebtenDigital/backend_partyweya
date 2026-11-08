<script lang="ts">
	// The "Visits" header button: the planned visit that happened and was never
	// written up. That count IS the nudge — at one visit a week it is 0 or 1, and
	// an unwritten visit is a visit that produced nothing. No badge at zero.
	import { page } from '$app/state';

	const due = $derived((page.data.visitsDue as number | undefined) ?? 0);
</script>

<a href="/visits" class="btn inline-flex items-center gap-2" title={due ? `${due} visit${due === 1 ? '' : 's'} not written up` : undefined}>
	Visits
	{#if due > 0}
		<span class="rounded-full bg-social px-1.5 py-0.5 font-mono text-[11px] leading-none font-semibold text-ink" aria-label="{due} not written up">{due}</span>
	{/if}
</a>
