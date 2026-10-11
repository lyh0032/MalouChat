import { z } from 'zod/v3'
import { prisma } from '../prisma'
import { getToolContext } from '../tool-context'
import { createStructuredTool } from './createStructuredTool'

const readFileSchema = z.object({
  fileId: z.string().optional().describe('文件的唯一ID（优先使用）'),
  file_path: z.string().optional().describe('文件名，用于模糊匹配（不推荐）')
})

export const readFileTool = createStructuredTool(
  async (args) => {
    const { fileId, file_path } = readFileSchema.parse(args)
    const { userId, conversationId } = getToolContext()

    if (!userId || !conversationId) {
      return '当前工具缺少文件访问上下文，无法读取附件。'
    }

    let file = null

    if (fileId) {
      file = await prisma.fileUpload.findFirst({
        where: { id: fileId, userId, conversationId },
        select: { id: true, originalName: true, mimeType: true, size: true, textContent: true, kind: true }
      })
    }

    if (!file && file_path) {
      file = await prisma.fileUpload.findFirst({
        where: { originalName: file_path, userId, conversationId },
        select: { id: true, originalName: true, mimeType: true, size: true, textContent: true, kind: true },
        orderBy: { createdAt: 'desc' }
      })
    }

    if (!file) {
      return '未找到该文件，请使用正确的 fileId 参数重试。'
    }

    if (!file.textContent) {
      return `文件 "${file.originalName}"（${file.mimeType}，${(file.size / 1024).toFixed(1)} KB）暂不支持文本解析。对于无法直接提取文本的文件（如 PDF、DOCX 等），暂时只能告知用户该文件类型暂不支持读取。`
    }

    return `文件 "${file.originalName}" 的内容如下：\n${file.textContent}`
  },
  {
    name: 'readFileTool',
    description:
      '读取用户上传文件的完整文本内容。仅当文件内容已被直接注入到对话上下文（见下方"以下是文本文件的内容"）时不需要调用此工具。适合以下场景：\n' +
      '1. 系统提示中标记了"可用 readFileTool 读取"的文件\n' +
      '2. 文件没有在上下文直接显示内容，且不需要精确查找，而是需要理解全文\n' +
      '注意：如果文件很大（超过系统提示中显示的"已建立索引"范围），不要调用此工具读取全部内容，应使用 semanticSearchTool 进行检索。',
    schema: readFileSchema
  }
)
