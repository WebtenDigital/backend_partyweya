-- AlterEnum
-- The performer, about their own booking: the earliest source, and a principal.
ALTER TYPE "Source" ADD VALUE 'ACT' BEFORE 'TICKETING';

-- AlterTable
ALTER TABLE "Act" ADD COLUMN     "bestTimeToReach" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "lastContacted" TIMESTAMP(3),
ADD COLUMN     "paidClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "whatsapp" BOOLEAN NOT NULL DEFAULT false;

