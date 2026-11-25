-- Fortnightly and monthly residencies. Pure expand: one enum value, one new
-- enum, two nullable columns. Every existing residency is WEEKLY (the
-- default), so nothing is backfilled and the week expands exactly as before.
-- No CHECK on the new columns: a rule that can't be placed (FORTNIGHTLY with
-- no anchor, MONTHLY with no pattern) is held out by the week with its
-- reason — /add refuses to save one; the database does not hide it.
CREATE TYPE "MonthlyOrdinal" AS ENUM ('FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LAST');

ALTER TYPE "Recurrence" ADD VALUE 'FORTNIGHTLY' BEFORE 'MONTHLY';

ALTER TABLE "Residency" ADD COLUMN "anchorDate" DATE,
ADD COLUMN "monthlyOrdinal" "MonthlyOrdinal";
