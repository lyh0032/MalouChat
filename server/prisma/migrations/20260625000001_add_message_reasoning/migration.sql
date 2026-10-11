ALTER TABLE "Message"
ADD COLUMN "deepThinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reasoningContent" TEXT NOT NULL DEFAULT '';
