ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'zh-CN';
ALTER TABLE "User" ADD CONSTRAINT "User_language_check" CHECK ("language" IN ('zh-CN', 'en-US'));
