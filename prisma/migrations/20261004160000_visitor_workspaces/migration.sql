ALTER TABLE "Thought" ADD COLUMN "workspaceId" TEXT;
CREATE INDEX "Thought_workspaceId_createdAt_idx" ON "Thought"("workspaceId", "createdAt");
