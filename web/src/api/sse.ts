export type SseEvent = {
  event: string
  data: unknown
}

const sseBoundaryPattern = /(?:\r\n|\r(?!\n)|\n){2}/

function findSseBoundary(buffer: string): { index: number; length: number } | null {
  const match = sseBoundaryPattern.exec(buffer)

  return match?.index === undefined
    ? null
    : {
        index: match.index,
        length: match[0].length
      }
}

function parseSseEvent(chunk: string): SseEvent | null {
  const lines = chunk.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const dataLines: string[] = []
  let event = 'message'

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
    let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1)

    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    if (field === 'event') {
      event = value || 'message'
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) return null

  const dataText = dataLines.join('\n')

  try {
    return {
      event,
      data: dataText ? JSON.parse(dataText) : null
    }
  } catch {
    throw new Error(`无法解析 SSE 事件“${event}”的数据`)
  }
}

export async function consumeSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('流式响应体为空')
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    throw new Error('流式响应类型无效')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamCompleted = false

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        buffer += decoder.decode()
        break
      }

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const boundary = findSseBoundary(buffer)

        if (!boundary) {
          break
        }

        const rawEvent = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary.length)

        const parsed = parseSseEvent(rawEvent)

        if (parsed) {
          onEvent(parsed)
        }
      }
    }

    const remainingEvent = parseSseEvent(buffer)

    if (remainingEvent) {
      onEvent(remainingEvent)
    }

    streamCompleted = true
  } finally {
    if (!streamCompleted) {
      await reader.cancel().catch(() => undefined)
    }

    reader.releaseLock()
  }
}
