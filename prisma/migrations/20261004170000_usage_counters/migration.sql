CREATE TABLE "UsageCounter" (
  "stage" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used" >= 0),
  PRIMARY KEY ("stage", "scope", "bucket", "startsAt")
);
