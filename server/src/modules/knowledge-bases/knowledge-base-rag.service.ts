import { prisma } from '../../lib/prisma'
import { chunkText } from '../../lib/chunker'
import { generateEmbedding, generateEmbeddings } from '../../lib/embeddings'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 80
const MIN_TEXT_LENGTH_FOR_CHUNKING = 1200

type ProcessKnowledgeBaseForRagOptions = {
  preserveCompletedStatus?: boolean
}

export async function processKnowledgeBaseForRag(
  knowledgeBaseId: string,
  options: ProcessKnowledgeBaseForRagOptions = {}
) {
  try {
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, indexingContent: true }
    })

    if (!knowledgeBase?.indexingContent?.trim()) {
      throw new Error('知识库没有可用于索引的内容')
    }

    if (!options.preserveCompletedStatus) {
      await prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          processingStatus: 'processing',
          processingError: null
        }
      })
    }

    const sourceText = knowledgeBase.indexingContent.trim()
    const chunks =
      sourceText.length < MIN_TEXT_LENGTH_FOR_CHUNKING
        ? [sourceText]
        : chunkText(sourceText, CHUNK_SIZE, CHUNK_OVERLAP)

    const existingChunks = await prisma.knowledgeBaseChunk.findMany({
      where: { knowledgeBaseId },
      select: { id: true, content: true }
    })
    const existingContentById = new Map(existingChunks.map((item) => [item.id, item.content]))
    const changedChunks = chunks
      .map((content, index) => ({
        id: `${knowledgeBaseId}_${index}`,
        index,
        content
      }))
      .filter((item) => existingContentById.get(item.id) !== item.content)
    const changedEmbeddings = changedChunks.length
      ? await generateEmbeddings(changedChunks.map((item) => item.content))
      : []

    const currentKnowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { indexingContent: true }
    })

    if (currentKnowledgeBase?.indexingContent?.trim() !== sourceText) {
      return
    }

    const values: Array<{
      id: string
      knowledgeBaseId: string
      index: number
      content: string
      embedding: number[]
    }> = []

    for (let i = 0; i < changedChunks.length; i += 1) {
      const chunk = changedChunks[i]
      const embedding = changedEmbeddings[i]
      if (!embedding?.length) continue

      values.push({
        id: chunk.id,
        knowledgeBaseId,
        index: chunk.index,
        content: chunk.content,
        embedding
      })
    }

    if (changedChunks.length > 0 && values.length !== changedChunks.length) {
      throw new Error('未能生成向量索引')
    }

    const newIds = chunks.map((_, index) => `${knowledgeBaseId}_${index}`)

    for (const item of values) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeBaseChunk" (id, "knowledgeBaseId", index, content, embedding, "createdAt")
         VALUES ($1, $2, $3, $4, $5::vector, NOW())
         ON CONFLICT (id) DO UPDATE SET content = $4, embedding = $5::vector`,
        item.id,
        item.knowledgeBaseId,
        item.index,
        item.content,
        `[${item.embedding.join(',')}]`
      )
    }

    await prisma.knowledgeBaseChunk.deleteMany({
      where: {
        knowledgeBaseId,
        id: { notIn: newIds }
      }
    })

    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        processingStatus: 'completed',
        processingError: null
      }
    })
  } catch (error) {
    if (!options.preserveCompletedStatus) {
      await prisma.knowledgeBase
        .update({
          where: { id: knowledgeBaseId },
          data: {
            processingStatus: 'failed',
            processingError:
              error instanceof Error ? error.message.slice(0, 300) : '知识库处理失败'
          }
        })
        .catch(() => {})
    }

    console.error('知识库索引失败:', error)
  }
}

export async function searchKnowledgeBaseChunks(
  knowledgeBaseId: string,
  query: string,
  topK = 5
): Promise<Array<{ content: string; similarity: number }>> {
  const embedding = await generateEmbedding(query)

  if (!embedding?.length) {
    return []
  }

  try {
    const vectorStr = `[${embedding.join(',')}]`
    const results = await prisma.$queryRawUnsafe<
      Array<{ index: number; content: string; similarity: number }>
    >(
      `SELECT index, content, 1 - (embedding <=> $1::vector) AS similarity
       FROM "KnowledgeBaseChunk"
       WHERE "knowledgeBaseId" = $2 AND content != ''
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      knowledgeBaseId,
      topK
    )

    const confidentResults = results.filter((item) => item.similarity > 0.25)
    const selected = [...confidentResults]
    const seen = new Set(selected.map((item) => item.index))

    for (const result of results) {
      if (selected.length >= topK) {
        break
      }

      if (!seen.has(result.index)) {
        selected.push(result)
        seen.add(result.index)
      }
    }

    return selected.slice(0, topK).map(({ content, similarity }) => ({ content, similarity }))
  } catch (error) {
    console.error('知识库检索失败:', error)
    return []
  }
}
