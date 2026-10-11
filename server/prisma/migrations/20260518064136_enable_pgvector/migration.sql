CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "FileChunk" ADD COLUMN embedding vector(1024);
CREATE INDEX "FileChunk_embedding_idx" ON "FileChunk" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
