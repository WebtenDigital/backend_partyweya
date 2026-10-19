<script lang="ts">
	// The PartyWeya mark at the left of every page header; always back to this week's lineup.
	let { week }: { week: string } = $props();
</script>

<a href="/build?week={week}" class="shrink-0" title="This week’s lineup">
	<img src="/brand/partyweya.png" alt="PartyWeya — this week’s lineup" class="h-10 w-auto" width="602" height="298" />
</a>
