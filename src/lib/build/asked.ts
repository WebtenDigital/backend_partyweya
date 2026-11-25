// What the call owns, and what the call has never got. Every field here has a
// column, and the call is the only thing that could fill it — so an empty one
// is a question nobody asked, and the call screen says so while you're on the
// phone (NOT ASKED YET), rather than the gap surfacing months later.
//
// And where a register came from. A guess shown in the same typeface as a
// judgement is how the mood balance drifted, so the three are told apart.

import { shortDate } from './week.js';

export const CALL_OWNED = [
	'startTime',
	'endTime',
	'prices', //  any price row; a night with none is NOT ASKED YET, never free
	'perks',
	'category',
	'runningSince',
	'lineup',
	'conversationTest',
	'contactName',
	'contactRole'
] as const;
export type CallOwned = (typeof CALL_OWNED)[number];

export interface AskedNight {
	kind: 'standing' | 'dated';
	startTime: string | null;
	endTime: string | null;
	prices: unknown[];
	perks: unknown[];
	offersAskedAt?: string | null; //  answered, "none" included
	categoryAskedAt?: string | null; // a standing night's; a dated night's category is asked every time
	runningSince?: string | null; //   a standing night's
	lineup: string[];
	rotatingAct?: boolean; //          a standing night's recorded "different act every week"
}

export interface AskedVenue {
	conversationTest: string | null;
	contactName: string | null;
	contactRole: string | null;
}

/** The call-owned fields still empty — for the night being logged (if any) and the venue. */
export function notAsked(night: AskedNight | null, venue: AskedVenue): Set<CallOwned> {
	const gaps = new Set<CallOwned>();
	const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
	if (night) {
		for (const k of ['startTime', 'endTime', 'prices'] as const) if (empty(night[k])) gaps.add(k);
		// No act AND not recorded as rotating is never-asked; "different every week" is an answer.
		if (empty(night.lineup) && !night.rotatingAct) gaps.add('lineup');
		// Offers on file answer it; so does "none", which only offersAskedAt can hold.
		if (empty(night.offersAskedAt) && empty(night.perks)) gaps.add('perks');
		if (night.kind === 'standing') {
			if (empty(night.categoryAskedAt)) gaps.add('category');
			if (empty(night.runningSince)) gaps.add('runningSince');
		}
	}
	for (const k of ['conversationTest', 'contactName', 'contactRole'] as const) if (empty(venue[k])) gaps.add(k);
	return gaps;
}

export type RegisterOrigin = { kind: 'room'; on: string } | { kind: 'q6' } | { kind: 'guess' };

/**
 * Where a standing night's register came from. Judged in the room when a
 * write-up set it (the write-up sets attendance, ATTENDED and the register
 * together); from question 6 when it is the venue's answer; otherwise a
 * guess — the import copied it from the category, and nothing has judged it.
 *
 * Known false positive, in the flattering direction: a category guess that
 * happens to agree with question 6 reads as "from question 6". The fix is a
 * Residency.registerAskedAt column (backfill: every unattended night a guess),
 * due with the contract pass that drops Venue.tier / nextContactDue / clearsF2.
 */
export function registerOrigin(
	night: { register: string | null; attendedAt: string | null; source: string | null },
	venue: { conversationTest: string | null; provisionalRegister: string | null }
): RegisterOrigin {
	if (night.attendedAt && night.source === 'ATTENDED') return { kind: 'room', on: night.attendedAt };
	if (venue.conversationTest && night.register && night.register === venue.provisionalRegister) return { kind: 'q6' };
	return { kind: 'guess' };
}

export const originLabel = (o: RegisterOrigin) =>
	o.kind === 'room' ? `judged in the room, ${shortDate(o.on)}` : o.kind === 'q6' ? 'from question 6' : 'guessed from category';
