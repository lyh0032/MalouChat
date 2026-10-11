CREATE INDEX "FileUpload_userId_kind_createdAt_idx" ON "FileUpload"("userId", "kind", "createdAt");
CREATE INDEX "FileUpload_userId_storageKey_idx" ON "FileUpload"("userId", "storageKey");
CREATE INDEX "Message_conversationId_type_createdAt_idx" ON "Message"("conversationId", "type", "createdAt");
