// Who to call about a night — the one rule, used by the "Who to call about this"
// panel, the call queue and the call screen. Three copies of it would drift.
//
//   1. occurrence.organiserId   → ORGANISER  (named, this date)
//   2. residency.organiserId    → ORGANISER  (named, the rule)
//   3. occurrence.bookingPhone  → UNKNOWN    (a number, this date)
//   4. residency.bookingPhone   → UNKNOWN    (a number, the rule)
//   5. the venue                → VENUE
//
// A named party beats an unknown number at any level; within a kind, the date
// beats the rule. So a promoter's standing night keeps routing to the promoter
// even when this week's flyer prints another number — the number is kept, it
// just doesn't take over.

export interface NightContact {
	organiserId: string | null;
	bookingPhone: string | null;
	bookingPhoneNote: string | null;
}

export type Level = 'occurrence' | 'residency';

export type Who =
	| { kind: 'ORGANISER'; organiserId: string; from: Level }
	| { kind: 'UNKNOWN'; phone: string; note: string | null; from: Level }
	| { kind: 'VENUE' };

export function whoToCall(occurrence: NightContact | null | undefined, residency: NightContact | null | undefined): Who {
	if (occurrence?.organiserId) return { kind: 'ORGANISER', organiserId: occurrence.organiserId, from: 'occurrence' };
	if (residency?.organiserId) return { kind: 'ORGANISER', organiserId: residency.organiserId, from: 'residency' };
	if (occurrence?.bookingPhone) return { kind: 'UNKNOWN', phone: occurrence.bookingPhone, note: occurrence.bookingPhoneNote, from: 'occurrence' };
	if (residency?.bookingPhone) return { kind: 'UNKNOWN', phone: residency.bookingPhone, note: residency.bookingPhoneNote, from: 'residency' };
	return { kind: 'VENUE' };
}

/** The call screen for a night, dialling whoever the rule picked. */
export function callHref(who: Who, venueId: string, ref: string) {
	if (who.kind === 'ORGANISER') return `/calls/organiser/${who.organiserId}?ref=${ref}`;
	if (who.kind === 'UNKNOWN') return `/calls/${venueId}?ref=${ref}&dial=booking`;
	return ref ? `/calls/${venueId}?ref=${ref}` : `/calls/${venueId}`;
}

export const UNKNOWN_LABEL = 'from the flyer — we don’t know whose this is';

interface PanelVenue {
	id: string;
	name: string;
	phone: string | null;
	whatsapp: boolean;
}
interface PanelOrganiser {
	id: string;
	name: string;
	contactName: string | null;
	role: string | null;
	phone: string | null;
	whatsapp: boolean;
}

/** The "Who to call about this" panel's props, for whichever party the rule picked. */
export function callPanel(who: Who, venue: PanelVenue, organiser: PanelOrganiser | null, ref: string) {
	const href = callHref(who, venue.id, ref);
	if (who.kind === 'ORGANISER' && organiser)
		return {
			kind: 'organiser' as const,
			id: organiser.id,
			who: 'ORGANISER',
			name: organiser.contactName ? `${organiser.contactName} · ${organiser.name}` : organiser.name,
			role: organiser.role,
			phone: organiser.phone,
			whatsapp: organiser.whatsapp,
			href,
			action: `Call ${organiser.contactName ?? organiser.name} →`,
			secondary: `${venue.name} · the room, not the night`
		};
	if (who.kind === 'UNKNOWN')
		return {
			kind: 'booking' as const,
			id: ref,
			who: 'UNKNOWN',
			name: who.note ? `Booking line — ${who.note}` : 'Booking line',
			role: null,
			phone: who.phone,
			whatsapp: false,
			href,
			action: 'Call this number →',
			secondary: `${UNKNOWN_LABEL}${who.from === 'residency' ? ' (printed for the standing night)' : ''}`
		};
	return {
		kind: 'venue' as const,
		id: venue.id,
		who: 'VENUE',
		name: venue.name,
		role: null,
		phone: venue.phone,
		whatsapp: venue.whatsapp,
		href,
		action: 'Call about this night →',
		secondary: null
	};
}
