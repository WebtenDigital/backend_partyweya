// Question 6's experiment, read back: the phone answer went in, the room's
// judgement came out. When the prediction misses there are two culprits with
// opposite fixes, and only the conversation test as OBSERVED in the room can
// tell them apart:
//
//   the room answered as the venue did, yet the register differed
//        → THE MAPPING missed: correct the table in the call script
//   the room answered differently from the venue
//        → THE VENUE was wrong: distrust its self-description

export type Answer = 'CAN_TALK' | 'ONLY_AT_THE_EDGES' | 'NO';
export type Reg = 'CHILL' | 'SOCIAL' | 'HIGH_ENERGY';

export interface Reading {
	verdict: 'held' | 'mapping' | 'venue' | 'unknown';
	text: string;
}

const SAID: Record<Answer, string> = { CAN_TALK: '“can talk”', ONLY_AT_THE_EDGES: '“only at the edges”', NO: '“no chance”' };
const REG: Record<Reg, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };

export function readPrediction(w: { predictedRegister: Reg | null; predictedFrom: Answer | null; judged: Reg | null; observed: Answer | null }): Reading | null {
	if (!w.predictedRegister || !w.judged) return null; // nothing predicted, or nothing judged
	const said = w.predictedFrom ? SAID[w.predictedFrom] : 'their answer';
	if (w.predictedRegister === w.judged) return { verdict: 'held', text: `Held: they said ${said} → ${REG[w.predictedRegister]}, and the room was ${REG[w.judged]}.` };
	const missed = `predicted ${REG[w.predictedRegister]}, judged ${REG[w.judged]}`;
	if (!w.observed || !w.predictedFrom)
		return { verdict: 'unknown', text: `Missed — ${missed}. No observed answer, so it can’t say whether the mapping or the venue was wrong.` };
	if (w.observed === w.predictedFrom)
		return { verdict: 'mapping', text: `The mapping missed — they said ${said} and the room was ${said} too, yet it was ${REG[w.judged]}, not ${REG[w.predictedRegister]}.` };
	return { verdict: 'venue', text: `The venue was wrong — they said ${said}; the room was ${SAID[w.observed]} (${missed}).` };
}
