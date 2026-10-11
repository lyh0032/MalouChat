-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "textContent" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "fileList" JSONB;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
