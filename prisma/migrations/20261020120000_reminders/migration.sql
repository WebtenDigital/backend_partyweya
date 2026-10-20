-- Reminders: written by hand, each hung off exactly one record.
-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "venueId" TEXT,
    "actId" TEXT,
    "organiserId" TEXT,
    "residencyId" TEXT,
    "occurrenceId" TEXT,
    "dueOn" DATE,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_doneAt_dueOn_idx" ON "Reminder"("doneAt", "dueOn");

-- CreateIndex
CREATE INDEX "Reminder_venueId_idx" ON "Reminder"("venueId");

-- CreateIndex
CREATE INDEX "Reminder_actId_idx" ON "Reminder"("actId");

-- CreateIndex
CREATE INDEX "Reminder_organiserId_idx" ON "Reminder"("organiserId");

-- CreateIndex
CREATE INDEX "Reminder_residencyId_idx" ON "Reminder"("residencyId");

-- CreateIndex
CREATE INDEX "Reminder_occurrenceId_idx" ON "Reminder"("occurrenceId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "Organiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A reminder with no subject is not register work. Exactly one parent.
ALTER TABLE "Reminder" ADD CONSTRAINT reminder_one_subject
  CHECK (num_nonnulls("venueId", "actId", "organiserId", "residencyId", "occurrenceId") = 1);
ALTER TABLE "Reminder" ADD CONSTRAINT reminder_needs_body
  CHECK (btrim("body") <> '');

-- Internal: never readable from the public role, never in public_events.
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Reminder" FROM anon, authenticated;
