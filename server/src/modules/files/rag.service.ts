import { prisma } from '../../lib/prisma'
import { chunkText } from '../../lib/chunker'
import { generateEmbedding, generateEmbeddings } from '../../lib/embeddings'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 80
const MIN_TEXT_LENGTH_FOR_CHUNKING = 2000

export async function processFileForRAG(fileId: string) {
  try {
    const file = await prisma.fileUpload.findUnique({
      where: { id: fileId },
      select: { id: true, textContent: true }
    })

    if (!file?.textContent || file.textContent.length < MIN_TEXT_LENGTH_FOR_CHUNKING) {
      return
    }

    await prisma.fileUpload.update({
      where: { id: fileId },
      data: { processingStatus: 'indexing' }
    })

    const chunks = chunkText(file.textContent, CHUNK_SIZE, CHUNK_OVERLAP)

    const embeddings = await generateEmbeddings(chunks)

    const values: Array<{ id: string; fileId: string; index: number; content: string; embedding: number[] }> = []
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i]
      if (!embedding || embedding.length === 0) continue
      values.push({
        id: `${fileId}_${i}`,
        fileId,
        index: i,
        content: chunks[i],
        embedding
      })
    }

    if (values.length === 0) {
      await prisma.fileUpload.update({
        where: { id: fileId },
        data: { processingStatus: 'failed' }
      })
      return
    }

    const newIds = values.map((v) => v.id)

    for (const v of values) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "FileChunk" (id, "fileId", index, content, embedding, "createdAt") 
         VALUES ($1, $2, $3, $4, $5::vector, NOW())
         ON CONFLICT (id) DO UPDATE SET content = $4, embedding = $5::vector`,
        v.id,
        v.fileId,
        v.index,
        v.content,
        `[${v.embedding.join(',')}]`
      )
    }

    await prisma.fileChunk.deleteMany({
      where: { fileId, id: { notIn: newIds } }
    })

    await prisma.fileUpload.update({
      where: { id: fileId },
      data: { processingStatus: 'completed' }
    })

    console.log(`RAG 完成: ${fileId}, ${values.length} 个分块已索引`)
  } catch (error) {
    await prisma.fileUpload.update({
      where: { id: fileId },
      data: { processingStatus: 'failed' }
    }).catch(() => {})

    console.error('RAG 处理失败:', error)
  }
}

export async function searchChunks(
  fileId: string,
  query: string,
  topK = 5
): Promise<Array<{ content: string; similarity: number }>> {
  const embedding = await generateEmbedding(query)

  if (!embedding || embedding.length === 0) {
    return []
  }

  try {
    const vectorStr = `[${embedding.join(',')}]`
    const results = await prisma.$queryRawUnsafe<
      Array<{ content: string; similarity: number }>
    >(
      `SELECT content, 1 - (embedding <=> $1::vector) AS similarity
       FROM "FileChunk"
       WHERE "fileId" = $2 AND content != ''
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      fileId,
      topK
    )

    return results.filter((r) => r.similarity > 0.3)
  } catch (error) {
    console.error('语义检索失败:', error)
    return []
  }
}
