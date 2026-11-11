<script lang="ts">
	// The one marker for a call-owned field the register has never had an answer
	// for (lib/build/asked.ts). Nothing on the call is required — but nothing is silent.
	let { when }: { when: boolean } = $props();
</script>

{#if when}<span class="ml-1 font-mono text-[10px] tracking-wider text-social">NOT ASKED YET</span>{/if}
