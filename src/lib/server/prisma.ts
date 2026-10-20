import { DATABASE_URL } from '$app/env/private';
import { createPrisma } from './db.js';

export const prisma = createPrisma(DATABASE_URL);

export * from '../../generated/prisma/enums';
