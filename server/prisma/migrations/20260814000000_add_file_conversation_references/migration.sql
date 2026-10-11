ALTER TABLE "FileUpload"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'upload';

CREATE TABLE "FileConversationReference" (
    "id" TEXT NOT NULL,
    "fileUploadId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileConversationReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FileConversationReference_fileUploadId_createdAt_idx"
ON "FileConversationReference"("fileUploadId", "createdAt");

CREATE INDEX "FileConversationReference_conversationId_messageId_idx"
ON "FileConversationReference"("conversationId", "messageId");

CREATE INDEX "FileConversationReference_messageId_idx"
ON "FileConversationReference"("messageId");

CREATE UNIQUE INDEX "FileConversationReference_fileUploadId_conversationId_messageId_key"
ON "FileConversationReference"("fileUploadId", "conversationId", "messageId");

ALTER TABLE "FileConversationReference"
ADD CONSTRAINT "FileConversationReference_fileUploadId_fkey"
FOREIGN KEY ("fileUploadId") REFERENCES "FileUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileConversationReference"
ADD CONSTRAINT "FileConversationReference_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileConversationReference"
ADD CONSTRAINT "FileConversationReference_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FileConversationReference" (
    "id",
    "fileUploadId",
    "conversationId",
    "messageId",
    "createdAt"
)
SELECT
    'legacy-' || "id",
    "id",
    "conversationId",
    "messageId",
    "createdAt"
FROM "FileUpload"
WHERE "conversationId" IS NOT NULL;
