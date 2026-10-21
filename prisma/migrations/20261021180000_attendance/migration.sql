-- Logging a night attended. attendedAt is the night we were in the room, not
-- the day it was logged, and not lastConfirmed. Internal: public_events lists
-- its columns and gains neither.
ALTER TABLE "Occurrence" ADD COLUMN "attendedAt" DATE,
ADD COLUMN "attendedBy" TEXT;

ALTER TABLE "Residency" ADD COLUMN "attendedAt" DATE,
ADD COLUMN "attendedBy" TEXT;

-- An attendance date only means something on an attended row.
ALTER TABLE "Occurrence" ADD CONSTRAINT "occurrence_attended_source"
  CHECK (coalesce("attendedAt" IS NULL OR "source" = 'ATTENDED', false));
ALTER TABLE "Residency" ADD CONSTRAINT "residency_attended_source"
  CHECK (coalesce("attendedAt" IS NULL OR "source" = 'ATTENDED', false));

-- Backfill: the two nights already attended, from their lastConfirmed.
-- attendedBy stays null — they predate it.
UPDATE "Residency" SET "attendedAt" = DATE '2026-10-19' WHERE "id" = 'marlin-acacia-saturday-band-bbq';
UPDATE "Residency" SET "attendedAt" = DATE '2026-10-21' WHERE "id" = 'cafesserie-cafesserie-band-saturdays';
