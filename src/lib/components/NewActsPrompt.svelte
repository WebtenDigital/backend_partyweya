<script lang="ts">
	// The quiet one-liner after a save that billed names nobody has classified yet.
	let { names }: { names: string[] } = $props();
	const list = $derived(names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`);
</script>

<p class="text-xs text-dim">
	{names.length} new {names.length === 1 ? 'name' : 'names'} — {list}.
	<a href="/acts?classify={encodeURIComponent(names[0])}" class="text-chill underline">Classify {names.length === 1 ? 'it' : 'them'}?</a>
</p>
