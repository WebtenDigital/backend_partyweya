-- A call about a promoter's night is a call to the promoter: their own cadence.
ALTER TABLE "Organiser" ADD COLUMN "lastContacted" TIMESTAMP(3),
ADD COLUMN "nextContactDue" TIMESTAMP(3),
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Acts are called too ("what have you got coming up?").
ALTER TABLE "Act" ADD COLUMN "nextContactDue" TIMESTAMP(3);
