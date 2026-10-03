-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Thought" (
    "id" UUID NOT NULL,
    "rawTranscript" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "categories" TEXT[],
    "actionable" BOOLEAN NOT NULL,
    "possibleAction" TEXT,
    "questionToExplore" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thought_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thought_createdAt_idx" ON "Thought"("createdAt");
