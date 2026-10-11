CREATE TYPE "AiModelType" AS ENUM ('chat', 'embedding', 'vision', 'speech', 'image');

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT 'dashscope',
    "type" "AiModelType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isUserSelectable" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dimensions" INTEGER,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiModel_type_code_key" ON "AiModel"("type", "code");
CREATE INDEX "AiModel_type_isEnabled_sortOrder_idx"
ON "AiModel"("type", "isEnabled", "sortOrder");

UPDATE "User"
SET "isAdmin" = true
WHERE "id" = (
    SELECT "id"
    FROM "User"
    ORDER BY "createdAt" ASC
    LIMIT 1
);

INSERT INTO "AiModel" (
    "id",
    "code",
    "displayName",
    "description",
    "provider",
    "type",
    "isEnabled",
    "isUserSelectable",
    "isDefault",
    "sortOrder",
    "dimensions",
    "settings",
    "updatedAt"
)
VALUES
    ('seed-chat-qwen-3-7-plus', 'qwen3.7-plus', 'Qwen 3.7 Plus', '阿里巴巴-qwen3.7-plus', 'dashscope', 'chat', true, true, true, 10, NULL, NULL, CURRENT_TIMESTAMP),
    ('seed-chat-qwen-3-6-plus', 'qwen3.6-plus', 'Qwen 3.6 Plus', '阿里巴巴-qwen3.6-plus', 'dashscope', 'chat', true, true, false, 20, NULL, NULL, CURRENT_TIMESTAMP),
    ('seed-chat-deepseek-v4-flash', 'deepseek-v4-flash', 'DeepSeek V4 Flash', '深度求索-deepseek-v4-flash', 'dashscope', 'chat', true, true, false, 30, NULL, NULL, CURRENT_TIMESTAMP),
    ('seed-embedding-text-v3', 'text-embedding-v3', 'Text Embedding V3', '文件与知识库向量检索模型（1024 维）', 'dashscope', 'embedding', true, false, true, 10, 1024, NULL, CURRENT_TIMESTAMP),
    ('seed-vision-qwen-3-7-plus', 'qwen3.7-plus', 'Qwen 3.7 Plus Vision', '图片内容理解与文字识别模型', 'dashscope', 'vision', true, false, true, 10, NULL, NULL, CURRENT_TIMESTAMP),
    ('seed-speech-qwen-3-asr-flash', 'qwen3-asr-flash', 'Qwen 3 ASR Flash', '语音转文字模型', 'dashscope', 'speech', true, false, true, 10, NULL, NULL, CURRENT_TIMESTAMP),
    ('seed-image-qwen-image-2-pro', 'qwen-image-2.0-pro', 'Qwen Image 2.0 Pro', '文本生成图片模型', 'dashscope', 'image', true, false, true, 10, NULL, '{"size":"1024*1024","promptExtend":true,"watermark":false}'::jsonb, CURRENT_TIMESTAMP);
