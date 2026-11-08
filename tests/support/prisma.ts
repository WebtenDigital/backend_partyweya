// The app's prisma module, for `npm run test:db`: the real client by default,
// or — after use(tx) — a transaction, so a test can run the app's own code
// (actions included) and roll every write back. $transaction inside the app
// just runs in the test's transaction.
import { createPrisma, type Tx } from '../../src/lib/server/db.ts';

export * from '../../src/generated/prisma/enums.ts';

const real = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
export let prisma: any = real;

export function use(tx: Tx) {
	prisma = new Proxy(tx, {
		get: (t: any, k) => (k === '$transaction' ? (arg: any) => (typeof arg === 'function' ? arg(t) : Promise.all(arg)) : t[k])
	});
}
export function reset() {
	prisma = real;
}
export const disconnect = () => real.$disconnect();
