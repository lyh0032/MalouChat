CREATE TYPE "KnowledgeBaseVisibility" AS ENUM ('private', 'team');

ALTER TABLE "KnowledgeBase"
ADD COLUMN "visibility" "KnowledgeBaseVisibility" NOT NULL DEFAULT 'private';

CREATE TABLE "KnowledgeBaseMember" (
  "id" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeBaseMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeBaseInvitation" (
  "id" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeBaseInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeBaseMember_knowledgeBaseId_userId_key"
ON "KnowledgeBaseMember"("knowledgeBaseId", "userId");

CREATE INDEX "KnowledgeBaseMember_userId_idx"
ON "KnowledgeBaseMember"("userId");

CREATE UNIQUE INDEX "KnowledgeBaseInvitation_knowledgeBaseId_inviteeId_key"
ON "KnowledgeBaseInvitation"("knowledgeBaseId", "inviteeId");

CREATE INDEX "KnowledgeBaseInvitation_inviteeId_createdAt_idx"
ON "KnowledgeBaseInvitation"("inviteeId", "createdAt");

CREATE INDEX "KnowledgeBaseInvitation_inviterId_idx"
ON "KnowledgeBaseInvitation"("inviterId");

ALTER TABLE "KnowledgeBaseMember"
ADD CONSTRAINT "KnowledgeBaseMember_knowledgeBaseId_fkey"
FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseMember"
ADD CONSTRAINT "KnowledgeBaseMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseInvitation"
ADD CONSTRAINT "KnowledgeBaseInvitation_knowledgeBaseId_fkey"
FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseInvitation"
ADD CONSTRAINT "KnowledgeBaseInvitation_inviterId_fkey"
FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBaseInvitation"
ADD CONSTRAINT "KnowledgeBaseInvitation_inviteeId_fkey"
FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
