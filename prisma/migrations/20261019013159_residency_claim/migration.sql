-- Standing nights carry a claim and its source, like occurrences, so the
-- Sunday build can show and gate them the same way.
ALTER TABLE "Residency" ADD COLUMN "claimType" "ClaimType",
ADD COLUMN "source" "Source";

ALTER TABLE "Residency" ADD CONSTRAINT residency_vetted_means_attended
  CHECK ("claimType" IS DISTINCT FROM 'VETTED' OR coalesce("source" = 'ATTENDED', false));
