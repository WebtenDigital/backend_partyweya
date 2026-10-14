<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<main class="mx-auto mt-24 max-w-xs px-4">
	<h1 class="mb-6 text-xl font-semibold">PartyWeya</h1>
	<form method="POST" action="?/login" class="flex flex-col gap-3">
		<input
			type="password"
			name="password"
			placeholder="Password"
			autocomplete="current-password"
			required
			class="rounded border px-3 py-2"
		/>
		{#if form?.wrong}
			<p class="text-sm text-red-600">Wrong password.</p>
		{/if}
		<button class="rounded bg-black px-3 py-2 text-white">Log in</button>
	</form>
</main>
