-- One-off backfill: claims that never followed their source. Since 6d867bb the
-- add form mapped "I was there" to FACTUAL; the register import copied a blank
-- claim. Both now derive through claimFor() (src/lib/provenance.ts).

-- marlin-acacia-saturday-band-bbq, cafesserie-cafesserie-band-saturdays
UPDATE "Residency" SET "claimType" = 'VETTED'
  WHERE "source" = 'ATTENDED' AND "claimType" <> 'VETTED';
UPDATE "Occurrence" SET "claimType" = 'VETTED'
  WHERE "source" = 'ATTENDED' AND "claimType" <> 'VETTED';

-- blankets-and-wine
UPDATE "Occurrence" SET "claimType" = 'FACTUAL'
  WHERE "source" IS NOT NULL AND "source" <> 'AUDIENCE' AND "claimType" IS NULL;
