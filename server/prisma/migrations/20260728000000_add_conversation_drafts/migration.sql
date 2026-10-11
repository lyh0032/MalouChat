CREATE TABLE "ConversationDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT,
    "fileUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationDraft_userId_key" ON "ConversationDraft"("userId");
CREATE UNIQUE INDEX "ConversationDraft_fileUploadId_key" ON "ConversationDraft"("fileUploadId");
CREATE INDEX "ConversationDraft_knowledgeBaseId_idx" ON "ConversationDraft"("knowledgeBaseId");

ALTER TABLE "ConversationDraft"
ADD CONSTRAINT "ConversationDraft_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationDraft"
ADD CONSTRAINT "ConversationDraft_knowledgeBaseId_fkey"
FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationDraft"
ADD CONSTRAINT "ConversationDraft_fileUploadId_fkey"
FOREIGN KEY ("fileUploadId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ConversationDraft" ("id", "userId", "createdAt", "updatedAt")
SELECT
    'draft_' || md5("id"),
    "id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";
