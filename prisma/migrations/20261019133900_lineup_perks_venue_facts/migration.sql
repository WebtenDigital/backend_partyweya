-- CreateEnum
CREATE TYPE "PerkKind" AS ENUM ('DRINK', 'FOOD', 'ENTRY', 'OTHER');

-- AlterTable
ALTER TABLE "Residency" ADD COLUMN     "lineup" TEXT;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "dressCode" TEXT,
ADD COLUMN     "hasFood" BOOLEAN,
ADD COLUMN     "parkingNote" TEXT;

-- CreateTable
CREATE TABLE "Perk" (
    "id" TEXT NOT NULL,
    "residencyId" TEXT,
    "occurrenceId" TEXT,
    "kind" "PerkKind" NOT NULL,
    "label" TEXT NOT NULL,
    "condition" TEXT,
    "activeUntil" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Perk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Perk_residencyId_idx" ON "Perk"("residencyId");

-- CreateIndex
CREATE INDEX "Perk_occurrenceId_idx" ON "Perk"("occurrenceId");

-- AddForeignKey
ALTER TABLE "Perk" ADD CONSTRAINT "Perk_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perk" ADD CONSTRAINT "Perk_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A perk belongs to exactly one standing night or one dated night.
ALTER TABLE "Perk" ADD CONSTRAINT perk_has_one_parent
  CHECK (("residencyId" IS NULL) <> ("occurrenceId" IS NULL));

-- Internal like the other base tables; offers reach the public only via the view.
ALTER TABLE "Perk" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Perk" FROM anon, authenticated;

-- public_events: the resident act and the night's offers join the public line.
-- Lineup: the dated row's own, else the standing night's it overrides.
-- Perks: the dated row's if it has any (they replace the rule's entirely),
-- else the standing night's; either way only those still running on THAT
-- row's date, in Kampala. notes, contacts, clearsF2 and the call cadence stay out.
DROP VIEW IF EXISTS public_events;
CREATE VIEW public_events
WITH (security_invoker = false) AS
SELECT
  o."id",
  o."date",
  o."eventName"    AS event_name,
  o."category",
  o."register",
  o."startTime"    AS start_time,
  o."endTime"      AS end_time,
  o."priceGate"    AS price_gate,
  o."priceAdvance" AS price_advance,
  o."priceNote"    AS price_note,
  coalesce(o."lineup", r."lineup") AS lineup,
  coalesce((
    SELECT jsonb_agg(
             jsonb_build_object('kind', p."kind", 'label', p."label", 'condition', p."condition")
             ORDER BY p."sortOrder", p."createdAt")
    FROM "Perk" p
    WHERE CASE WHEN EXISTS (SELECT 1 FROM "Perk" op WHERE op."occurrenceId" = o."id")
               THEN p."occurrenceId" = o."id"
               ELSE p."residencyId" = o."residencyId" END
      AND (p."activeUntil" IS NULL
           OR ((p."activeUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Kampala')::date >= o."date")
  ), '[]'::jsonb) AS perks,
  o."claimType"    AS claim_type,
  v."id"           AS venue_id,
  v."name"         AS venue,
  v."location",
  v."areas",
  z."name"         AS zone,
  z."division"
FROM "Occurrence" o
JOIN "Venue" v ON v."id" = o."venueId"
LEFT JOIN "Zone" z ON z."name" = v."zoneName"
LEFT JOIN "Residency" r ON r."id" = o."residencyId"
WHERE o."status" = 'CONFIRMED'
  AND o."startTime" IS NOT NULL
  AND o."register" IS NOT NULL
  AND o."date" >= (now() AT TIME ZONE 'Africa/Kampala')::date;

GRANT SELECT ON public_events TO anon, authenticated;
