// Saving a number from the "Who to call about this" panel without a <form>:
// the panel sits inside pages that are one big form (see reminders.ts).
import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

export type ContactKind = 'venue' | 'organiser' | 'act';

export async function savePhone(kind: ContactKind, id: string, phone: string, whatsapp: boolean) {
	const body = new FormData();
	body.set('kind', kind);
	body.set('id', id);
	body.set('phone', phone);
	body.set('whatsapp', String(whatsapp));
	const res = await fetch('/contacts?/phone', {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
	});
	const result = deserialize(await res.text());
	if (result.type === 'success') await invalidateAll();
	return result;
}
