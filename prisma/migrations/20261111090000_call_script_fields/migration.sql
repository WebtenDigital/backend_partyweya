-- The revised call script. Pure expand: three nullable columns' worth of
-- facts the call now asks for, nothing renamed, nothing dropped, no rows touched.
--   Residency.priceAdvance     question 3 asks it of standing nights too
--   Residency.categoryAskedAt  question 5: null = the category was inferred
--   Perk.confirmedOn/By        an offer's own confirmation, apart from its night's
ALTER TABLE "Residency" ADD COLUMN "priceAdvance" INTEGER,
ADD COLUMN "categoryAskedAt" TIMESTAMP(3);

ALTER TABLE "Perk" ADD COLUMN "confirmedOn" TIMESTAMP(3),
ADD COLUMN "confirmedBy" TEXT;

-- The same guards the dated nights carry.
ALTER TABLE "Residency" ADD CONSTRAINT residency_advance_cheaper_than_gate
  CHECK ("priceAdvance" IS NULL OR "priceGate" IS NULL OR "priceAdvance" < "priceGate");
ALTER TABLE "Residency" ADD CONSTRAINT residency_advance_not_negative
  CHECK (coalesce("priceAdvance", 0) >= 0);
