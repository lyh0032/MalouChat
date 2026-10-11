import { z } from 'zod/v3'
import { MyMcpClient, extractMcpToolText } from '../mcp'
import { env } from '../../config/env'
import { createStructuredTool } from './createStructuredTool'
import { getToolContext } from '../tool-context'
import { isAbortError, throwIfAborted } from '../../utils/abort'

const webSearchToolInputSchema = z.object({
  query: z.string().describe('用户想要搜索的具体内容或问题，必须是关键词或完整的搜索语句。')
})

let mcpClientInstance: MyMcpClient | null = null

async function getMcpClient(): Promise<MyMcpClient> {
  if (!env.DASHSCOPE_WEBSEARCH_ENABLED) {
    throw new Error('联网搜索工具未启用')
  }

  if (!env.DASHSCOPE_API_KEY) {
    throw new Error('未配置 DASHSCOPE_API_KEY，无法使用联网搜索')
  }

  if (!mcpClientInstance) {
    mcpClientInstance = new MyMcpClient(
      env.DASHSCOPE_WEBSEARCH_MCP_URL,
      env.DASHSCOPE_API_KEY
    )
    await mcpClientInstance.connect()
  }
  return mcpClientInstance
}

export const webSearchTool = createStructuredTool(
  async (input) => {
    const { query } = webSearchToolInputSchema.parse(input)
    const { signal } = getToolContext()

    try {
      throwIfAborted(signal)
      const client = await getMcpClient()

      const res = await client.callTool('bailian_web_search', { query }, signal)
      throwIfAborted(signal)

      // 提取文本结果
      const resultText = extractMcpToolText(res)

      return resultText
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error
      }

      console.error('❌ 搜索工具执行出错:', error)

      return `联网搜索服务暂时不可用。错误详情: ${error instanceof Error ? error.message : '未知错误'}`
    }
  },
  {
    name: 'webSearchTool',
    description:
      '当你需要回答关于时事新闻、天气、股价、体育比分等实时信息时，请使用此工具。不要编造信息。',
    schema: webSearchToolInputSchema
  }
)
