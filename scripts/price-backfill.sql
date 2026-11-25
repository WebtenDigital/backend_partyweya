-- Re-sync the backfilled price rows from the old columns. Run once more just
-- before the price-rows code deploys: until then the live code still writes
-- priceGate / priceAdvance, so a price changed on a call after the migration
-- would otherwise be stale in its row. Touches only the backfill's own rows
-- (ids pg-… / pa-…), and skips any night that has hand-entered rows — those
-- replaced the backfill on purpose. Idempotent. Never run after the deploy:
-- from then on the rows are the truth and the old columns go stale.
DELETE FROM "Price" p WHERE (p."id" LIKE 'pg-%' OR p."id" LIKE 'pa-%')
  AND NOT EXISTS (SELECT 1 FROM "Price" h WHERE h."id" NOT LIKE 'pg-%' AND h."id" NOT LIKE 'pa-%'
                  AND (h."residencyId" = p."residencyId" OR h."occurrenceId" = p."occurrenceId"));
INSERT INTO "Price" ("id", "residencyId", "label", "amount", "timing", "sortOrder")
  SELECT 'pg-' || n."id", n."id", 'Entry', n."priceGate", 'GATE', 0 FROM "Residency" n
  WHERE n."priceGate" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Price" p WHERE p."residencyId" = n."id");
INSERT INTO "Price" ("id", "residencyId", "label", "amount", "timing", "sortOrder")
  SELECT 'pa-' || n."id", n."id", 'Advance', n."priceAdvance", 'ADVANCE', 1 FROM "Residency" n
  WHERE n."priceAdvance" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Price" p WHERE p."residencyId" = n."id" AND p."id" NOT LIKE 'pg-%');
INSERT INTO "Price" ("id", "occurrenceId", "label", "amount", "timing", "sortOrder")
  SELECT 'pg-' || n."id", n."id", 'Entry', n."priceGate", 'GATE', 0 FROM "Occurrence" n
  WHERE n."priceGate" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Price" p WHERE p."occurrenceId" = n."id");
INSERT INTO "Price" ("id", "occurrenceId", "label", "amount", "timing", "sortOrder")
  SELECT 'pa-' || n."id", n."id", 'Advance', n."priceAdvance", 'ADVANCE', 1 FROM "Occurrence" n
  WHERE n."priceAdvance" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Price" p WHERE p."occurrenceId" = n."id" AND p."id" NOT LIKE 'pg-%');
