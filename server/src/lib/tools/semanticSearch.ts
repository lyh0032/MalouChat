import { z } from 'zod/v3'
import { searchChunks } from '../../modules/files/rag.service'
import { prisma } from '../prisma'
import { getToolContext } from '../tool-context'
import { createStructuredTool } from './createStructuredTool'

const semanticSearchSchema = z.object({
  fileId: z.string().describe('要检索的文件ID'),
  query: z.string().describe('检索查询，描述你想在文件中查找的内容')
})

export const semanticSearchTool = createStructuredTool(
  async (args) => {
    const { fileId, query } = semanticSearchSchema.parse(args)
    const { userId, conversationId } = getToolContext()

    if (!userId || !conversationId) {
      return '当前工具缺少文件访问上下文，无法检索附件。'
    }

    const file = await prisma.fileUpload.findFirst({
      where: { id: fileId, userId, conversationId },
      select: { processingStatus: true, originalName: true }
    })

    if (!file) {
      return '未找到当前对话可访问的文件，请使用本轮附件列表中的 fileId。'
    }

    if (file.processingStatus !== 'completed') {
      return `文件 "${file.originalName}" 的索引尚未完成（当前状态：${file.processingStatus}），暂时无法进行语义检索。`
    }

    const chunks = await searchChunks(fileId, query, 5)

    if (!chunks.length) {
      return '未在文件中找到与查询相关的内容。'
    }

    const results = chunks.map(
      (chunk, i) =>
        `片段 ${i + 1}（相似度 ${(chunk.similarity * 100).toFixed(0)}%）：\n${chunk.content}`
    )

    return `从文件中检索到以下相关内容：\n\n${results.join('\n\n')}`
  },
  {
    name: 'semanticSearchTool',
    description:
      '在建立了索引的大文件中进行语义搜索，只返回与查询最相关的片段（而非全文）。\n' +
      '适合以下场景：\n' +
      '1. 文件标记了"大文件已建立索引"的提示\n' +
      '2. 你需要查找文件中的特定信息（某个数字、结论、章节、术语等）\n' +
      '3. 文件太大，不适合用 readFileTool 读取全部内容\n' +
      '用此工具替代 readFileTool，避免读取超出上下文窗口的大量文本。',
    schema: semanticSearchSchema
  }
)
