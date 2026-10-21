import { error, redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import type { PageServerLoad } from './$types';

// Calling an organiser about a night is still a call about a night at a venue,
// so it opens the one call screen, dialling them. ?ref= names the night.
export const load: PageServerLoad = async ({ params, url }) => {
	const ref = url.searchParams.get('ref');
	if (!ref) error(400, 'Which night is this call about? Open it from the night’s “Who to call” panel.');
	const [organiser, night] = await Promise.all([
		prisma.organiser.findUnique({ where: { id: params.organiserId }, select: { id: true } }),
		prisma.occurrence.findUnique({ where: { id: ref }, select: { venueId: true } }).then(
			(o) => o ?? prisma.residency.findUnique({ where: { id: ref }, select: { venueId: true } })
		)
	]);
	if (!organiser) error(404, 'No such organiser');
	if (!night) error(404, 'No such night');
	const week = url.searchParams.get('week');
	redirect(307, `/calls/${night.venueId}?ref=${encodeURIComponent(ref)}&dial=organiser${week ? `&week=${week}` : ''}`);
};
