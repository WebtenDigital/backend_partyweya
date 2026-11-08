-- The planned visit: the week's attendance as an intention, before it happens.
-- Pure expand. A Visit points at exactly one night — a standing night or a
-- dated one — and is invisible to the week's expansion. Plus the room's own
-- answer to the conversation test on the write-up: optional, never on Venue.
-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN     "observedConversation" "ConversationTest";

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "residencyId" TEXT,
    "occurrenceId" TEXT,
    "date" DATE NOT NULL,
    "register" "Register",
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_date_idx" ON "Visit"("date");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Visit" ADD CONSTRAINT "visit_one_night" CHECK (num_nonnulls("residencyId", "occurrenceId") = 1);

-- Internal like the rest of the register: RLS on, no grants.
ALTER TABLE "Visit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Visit" FROM anon, authenticated;
