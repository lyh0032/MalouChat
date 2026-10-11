-- CreateEnum
CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "knowledgeBaseId" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentSize" INTEGER,
    "storageKey" TEXT,
    "storageUrl" TEXT,
    "indexingContent" TEXT,
    "processingStatus" "KnowledgeBaseStatus" NOT NULL DEFAULT 'queued',
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseChunk" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBaseChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_storageKey_key" ON "KnowledgeBase"("storageKey");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_processingStatus_idx" ON "KnowledgeBase"("userId", "processingStatus");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_createdAt_idx" ON "KnowledgeBase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_knowledgeBaseId_idx" ON "KnowledgeBaseChunk"("knowledgeBaseId");

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
