-- Discovery: a venue with no night on file is asked what it runs. Pure expand —
-- defaulted and nullable columns only — so it ships before the code that reads it.
--
--   noProgramme / noProgrammeAt  reached, and runs nothing: leaves the discovery list
--   contactAttempts              no-answers in a row; reset on contact; 4 = unreachable

ALTER TABLE "Venue" ADD COLUMN "noProgramme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "noProgrammeAt" TIMESTAMP(3),
ADD COLUMN "contactAttempts" INTEGER NOT NULL DEFAULT 0;
