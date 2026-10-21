<script lang="ts">
	// Search the roster or add someone new, in the same save. Its fields post
	// under `name_…` and organiserFrom() reads them; nothing here saves by itself.
	interface Option {
		id: string;
		name: string;
		contactName: string | null;
		role: string | null;
		phone: string | null;
	}
	interface Props {
		name: string;
		organisers: Option[];
		value?: string | null;
		/** Hide the number field: a new organiser takes a number the caller already has. */
		numberFrom?: string;
		placeholder?: string;
	}
	let { name, organisers, value = null, numberFrom, placeholder = 'Search organisers, or type a new name' }: Props = $props();

	const ROLES = ['PROMOTER', 'OWNER', 'MANAGER', 'MARKETING', 'HOST'];
	// svelte-ignore state_referenced_locally — seeds once; callers re-key to reset.
	let id = $state(value ?? '');
	let query = $state('');
	let fresh = $state({ name: '', contact: '', phone: '', whatsapp: false, role: 'PROMOTER' });

	const picked = $derived(organisers.find((o) => o.id === id));
	const matches = $derived(
		query.trim() ? organisers.filter((o) => `${o.name} ${o.contactName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : []
	);
	const exact = $derived(organisers.some((o) => o.name.toLowerCase() === query.trim().toLowerCase()));

	function create() {
		fresh = { ...fresh, name: query.trim() };
		id = '__new';
		query = '';
	}
</script>

<div class="space-y-2">
	<input type="hidden" name="{name}_id" value={id} />
	{#if picked}
		<div class="flex items-center justify-between gap-2 rounded-md border border-dated/50 bg-dated/5 px-3 py-2 text-sm">
			<span>
				{picked.name}{picked.contactName ? ` · ${picked.contactName}` : ''}
				<span class="font-mono text-[11px] {picked.phone ? 'text-dim' : 'text-social'}">{picked.phone ?? 'no number'}</span>
			</span>
			<button type="button" class="text-xs text-dim underline" onclick={() => (id = '')}>Clear</button>
		</div>
	{:else if id === '__new'}
		<div class="space-y-2 rounded-md border border-chill/40 bg-chill/5 p-3">
			<p class="font-mono text-[10px] tracking-wider text-chill">NEW ORGANISER — ADDED WITH THIS SAVE</p>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="field"><span>Promoter or company</span><input name="{name}_name" class="input h-10" bind:value={fresh.name} required /></label>
				<label class="field"><span>Who you speak to</span><input name="{name}_contact" class="input h-10" bind:value={fresh.contact} placeholder="—" /></label>
				{#if numberFrom}
					<p class="field"><span>Number</span><span class="input flex h-10 items-center font-mono text-sm">{numberFrom}</span></p>
				{:else}
					<label class="field"><span>Number</span><input name="{name}_phone" type="tel" class="input h-10 font-mono" bind:value={fresh.phone} placeholder="none yet" /></label>
				{/if}
				<label class="field"><span>Role</span>
					<select name="{name}_role" class="input h-10" bind:value={fresh.role}>
						{#each ROLES as r (r)}<option value={r}>{r}</option>{/each}
					</select>
				</label>
			</div>
			<div class="flex items-center justify-between">
				<label class="flex items-center gap-2 text-xs"><input type="checkbox" name="{name}_whatsapp" class="size-4" bind:checked={fresh.whatsapp} /> On WhatsApp</label>
				<button type="button" class="text-xs text-dim underline" onclick={() => (id = '')}>Cancel</button>
			</div>
		</div>
	{:else}
		<input
			class="input h-10"
			{placeholder}
			autocomplete="off"
			aria-label="Organiser"
			bind:value={query}
			onkeydown={(e) => {
				// Enter would submit the record's whole form.
				if (e.key !== 'Enter') return;
				e.preventDefault();
				if (matches.length === 1) id = matches[0].id;
				else if (query.trim() && !exact) create();
			}}
		/>
		{#if query.trim()}
			<div class="flex flex-wrap gap-1">
				{#each matches as o (o.id)}
					<button type="button" class="rounded border border-line px-2 py-1 text-xs hover:border-dated" onclick={() => ((id = o.id), (query = ''))}>
						{o.name}{o.contactName ? ` · ${o.contactName}` : ''}
					</button>
				{/each}
				{#if !exact}
					<button type="button" class="rounded border border-chill/60 px-2 py-1 text-xs text-chill hover:bg-chill/10" onclick={create}>+ Add “{query.trim()}”</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>
