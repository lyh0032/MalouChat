DELETE FROM "FileConversationReference" AS duplicate
USING "FileConversationReference" AS retained
WHERE duplicate."messageId" IS NULL
  AND retained."messageId" IS NULL
  AND duplicate."fileUploadId" = retained."fileUploadId"
  AND duplicate."conversationId" = retained."conversationId"
  AND duplicate."id" > retained."id";

CREATE UNIQUE INDEX "FileConversationReference_pending_key"
ON "FileConversationReference"("fileUploadId", "conversationId")
WHERE "messageId" IS NULL;
