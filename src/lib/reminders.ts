// Posting to the reminder actions without a <form>: reminders render inside
// pages that are one big form (the call screen, the night editors), where a
// nested form is invalid HTML and its fields would ride along with the save.
import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

export async function reminderAction(action: 'add' | 'done' | 'reopen', fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const res = await fetch(`/reminders?/${action}`, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
	});
	const result = deserialize(await res.text());
	if (result.type === 'success') await invalidateAll();
	return result;
}
