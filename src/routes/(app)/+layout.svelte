<script lang="ts">
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<div class="sticky top-0 z-20 border-b border-line bg-ink/90 px-4 py-2 backdrop-blur sm:px-6">
	<a href="/build?week={data.currentWeek}" class="inline-block" title="This week’s lineup">
		<img src="/brand/partyweya.png" alt="PartyWeya — this week’s lineup" class="h-8 w-auto" width="602" height="298" />
	</a>
</div>

{@render children()}
