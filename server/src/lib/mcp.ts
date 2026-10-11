import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

function normalizeMcpContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (!item || typeof item !== 'object') {
          return ''
        }

        if ('text' in item && typeof item.text === 'string') {
          return item.text
        }

        if ('data' in item) {
          try {
            return JSON.stringify(item.data)
          } catch {
            return String(item.data)
          }
        }

        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  if (content == null) {
    return ''
  }

  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function extractMcpPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return result
  }

  if ('content' in result) {
    return result.content
  }

  if ('toolResult' in result) {
    return result.toolResult
  }

  return result
}

export class MyMcpClient {
  client: Client
  transport: StreamableHTTPClientTransport

  constructor(mcpUrl: string, apiKey: string) {
    this.client = new Client({ name: 'WebSearch', version: '1.0.0' })
    // 初始化传输层，指向你的第三方链接
    this.transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    })
  }

  // 连接并获取工具列表
  async connect() {
    await this.client.connect(this.transport)
    // 获取所有可用工具（例如：搜索、计算器等）
    const tools = await this.client.listTools()
    return tools
  }

  // 调用具体工具
  async callTool(toolName: string, args: Record<string, any>, signal?: AbortSignal) {
    const result = await this.client.callTool(
      {
        name: toolName,
        arguments: args
      },
      undefined,
      signal ? { signal } : undefined
    )
    return result
  }
}

export function extractMcpToolText(result: unknown): string {
  return normalizeMcpContent(extractMcpPayload(result))
}
