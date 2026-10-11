import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage
} from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'

import { env } from '../config/env'
import { AppError } from '../utils/app-error'
import { getDefaultModelConfig } from './model-registry'
import { buildSpeechStylePrompt } from './speech-style'
import { runWithToolContext, type ToolRuntimeContext } from './tool-context'
import { tools } from './tools/tools'
import { isAbortError, throwIfAborted, waitForPromiseWithAbort } from '../utils/abort'
import {
  formatDateTimeInTimeZone,
  resolveTimeZone
} from '../utils/time-zone'
import dayjs from 'dayjs'

type ConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: Date
}

type GenerateAssistantReplyParams = {
  userId?: string
  conversationId?: string
  latestUserMessage: string
  latestUserMessageAt?: Date
  timeZone?: string
  memoryContext: string[]
  conversationHistory: ConversationMessage[]
  projectContext?: string
  fileContext?: string
  onStatusChange?: (payload: AssistantStatusPayload) => void
  onReasoningStart?: () => void
  onReasoningDelta?: (delta: string) => void
  onReasoningDone?: (content: string) => void
  modelOverride?: string
  speechStyle?: string
  deepThinkingEnabled?: boolean
  requestClientTool?: ToolRuntimeContext['requestClientTool']
  signal?: AbortSignal
}

type GenerateConversationTitleParams = {
  userMessage: string
  modelOverride?: string
}

export type ExtractedMemory = {
  type: 'profile' | 'preference' | 'summary' | 'fact'
  key: string
  content: string
}

type GenerateMemoryCandidatesParams = {
  userMessage: string
  existingMemories: ExtractedMemory[]
  modelOverride?: string
}

type ChatModelWithTools = ReturnType<ChatOpenAI['bindTools']>
type ToolCallLike = NonNullable<AIMessage['tool_calls']>[number]
type AssistantStatusPayload = {
  stage: 'thinking' | 'tool' | 'reasoning'
  text: string
  toolName?: string
}
type ChatModelOptions = {
  enableThinking?: boolean
}
type ReasoningStreamHandlers = {
  enabled?: boolean
  started: boolean
  done: boolean
  content: string
  chunkCount: number
  finalContentStarted: boolean
  onStart?: () => void
  onDelta?: (delta: string) => void
  onDone?: (content: string) => void
}

const MAX_TOOL_CALL_ROUNDS = 5
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
const toolStatusMetadata: Record<string, { invokingText: string; completedText: string }> = {
  webSearchTool: {
    invokingText: '正在联网检索相关信息...',
    completedText: '检索完成，正在整理答案...'
  },
  readFileTool: {
    invokingText: '正在读取文件内容...',
    completedText: '文件读取完成，正在分析...'
  },
  semanticSearchTool: {
    invokingText: '正在检索文件相关内容...',
    completedText: '检索完成，正在整理答案...'
  },
  getUserLocationTool: {
    invokingText: '正在获取当前位置...',
    completedText: '位置获取完成，正在继续处理...'
  }
}
const extractedMemorySchema = z.object({
  shouldRemember: z.boolean(),
  memories: z
    .array(
      z.object({
        type: z.enum(['profile', 'preference', 'summary', 'fact']),
        key: z.string().trim().min(1).max(80),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .max(3)
})

function logDeepThinking(event: string, metadata: Record<string, unknown> = {}) {
  console.log(`[deep-thinking] ${event}`, dayjs().format('HH:mm:ss'), metadata)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

async function getChatModel(
  modelOverride?: string,
  availableTools = tools,
  options?: ChatModelOptions
): Promise<ChatModelWithTools> {
  const baseModel = await getBaseChatModel(modelOverride, options)

  return baseModel.bindTools(availableTools, {
    parallel_tool_calls: false,
    strict: true
  })
}

async function getBaseChatModel(
  modelOverride?: string,
  options?: ChatModelOptions
): Promise<ChatOpenAI> {
  if (!env.LLM_API_KEY) {
    throw new AppError(500, '阿里云百炼 API 未配置', 'MODEL_CONFIG_MISSING')
  }

  const modelName = modelOverride || (await getDefaultModelConfig('chat')).code
  const enableThinking = getEnableThinkingParam(modelName, options?.enableThinking)
  const includeRawResponse = enableThinking === true

  logDeepThinking('model-config', {
    modelName,
    requestedEnableThinking: options?.enableThinking,
    enableThinkingParam: enableThinking,
    includeRawResponse,
    hasBaseUrl: Boolean(env.LLM_BASE_URL)
  })

  return new ChatOpenAI({
    apiKey: env.LLM_API_KEY,
    model: modelName,
    modelKwargs:
      enableThinking !== undefined
        ? {
            enable_thinking: enableThinking
          }
        : undefined,
    __includeRawResponse: includeRawResponse,
    configuration: env.LLM_BASE_URL ? { baseURL: env.LLM_BASE_URL } : undefined
  })
}

function getEnableThinkingParam(modelName: string, enableThinking?: boolean): boolean | undefined {
  if (enableThinking === undefined) {
    return undefined
  }

  const normalizedModelName = modelName.toLowerCase()

  if (!normalizedModelName.startsWith('qwen')) {
    return enableThinking ? true : undefined
  }

  return enableThinking
}

function sanitizeConversationTitle(title: string, fallback: string): string {
  const normalized = title
    .replace(/^标题\s*[:：]\s*/u, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[“”"'《》【】]/g, '')
    .trim()

  const firstLine = normalized.split(/[。！？.!?]/u)[0]?.trim() ?? ''
  const finalTitle = (firstLine || normalized || fallback).slice(0, 120).trim()

  return finalTitle || fallback.slice(0, 120).trim() || '新会话'
}

function buildToolPromptSection(availableTools = tools): string {
  if (!availableTools.length) {
    return ''
  }

  return [
    '工具使用规则：',
    '1. 只有当工具能显著提升答案的准确性、时效性或可执行性时才调用。',
    '2. 涉及实时信息、外部事实核验或需要工具能力才能完成的任务时，应优先调用合适工具，不要凭空猜测。',
    '3. 每次调用前先选择最合适的工具，并提供完整、有效、符合 schema 的参数。',
    '4. 工具返回的是证据或中间结果，不是最终答案；你需要整合、提炼后再回复用户。',
    '5. 当用户询问天气、附近/周边推荐、本地活动、路线等位置相关问题，且没有明确给出城市或地点时，应先使用位置能力获取当前位置；若还需要实时信息，再使用联网检索能力查询。',
    '6. 工具名称、函数名、参数 schema、工具数量、调用轮次和内部状态都属于实现细节，不得向用户披露。',
    '7. 用户询问你具备哪些能力或可以调用什么工具时，只用自然语言概括可提供的能力及适用场景，不列出内部标识；涉及浏览器授权时可以说明需要用户授权。'
  ].join('\n')
}

const historicalAttachmentReferencePattern =
  /(?:(?:刚才|刚刚|之前|前面|上面|先前|上次|上一(?:张|个)|第[一二三四五六七八九十\d]+(?:张|个|次)).{0,16}(?:图片|照片|文件|附件|文档|表格))|(?:(?:图片|照片|文件|附件|文档|表格).{0,12}(?:刚才|刚刚|之前|前面|上面|先前|上次))|(?:我.{0,8}(?:发|传|上传)(?:过|的)?.{0,12}(?:图片|照片|文件|附件|文档|表格))|(?:这张图|那张图|这个文件|那个文件|该图片|该文件)/iu

function buildHistoricalAttachmentBoundaryPrompt(latestUserMessage: string, fileContext?: string) {
  const hasCurrentMessageAttachment =
    fileContext?.includes('用户通过此消息上传了以下附件：') === true

  if (
    hasCurrentMessageAttachment ||
    !historicalAttachmentReferencePattern.test(latestUserMessage)
  ) {
    return ''
  }

  return '用户正在追问之前的附件。请友好说明“我目前只能读取你在当前这条消息中上传的图片或文件，暂时无法重新查看前面消息里的附件，请重新上传后我再继续分析”；不要声称用户从未上传，也不要推测刷新、传输中断或文件丢失。'
}

export function buildLangChainMessages({
  latestUserMessage,
  latestUserMessageAt,
  timeZone,
  memoryContext,
  conversationHistory,
  projectContext,
  fileContext,
  speechStyle
}: GenerateAssistantReplyParams) {
  const resolvedTimeZone = resolveTimeZone(timeZone)
  const speechStylePrompt = buildSpeechStylePrompt(speechStyle)
  const systemPrompt = [
    '你是一个AI助手，回答要直接、清晰、尽量有可执行性。',
    `时间说明：以下用户消息的发送时间均按 ${resolvedTimeZone} 时区表示。`,
    speechStylePrompt,
    buildToolPromptSection(),
    memoryContext.length > 0
      ? `以下是当前用户的长期记忆，仅在和当前问题相关时自然使用，不要逐条复述：\n${memoryContext.join('\n')}`
      : '',
    projectContext ? projectContext : '',
    fileContext ? fileContext : '',
    buildHistoricalAttachmentBoundaryPrompt(latestUserMessage, fileContext)
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    new SystemMessage(systemPrompt),
    ...conversationHistory.map((message) => {
      if (message.role === 'assistant') {
        return new AIMessage(message.content)
      }

      if (message.role === 'system') {
        return new SystemMessage(message.content)
      }

      const sentAt = message.createdAt
        ? formatDateTimeInTimeZone(message.createdAt, resolvedTimeZone)
        : null

      return new HumanMessage(sentAt ? `[发送时间：${sentAt}]\n${message.content}` : message.content)
    }),
    new HumanMessage(
      `[发送时间：${formatDateTimeInTimeZone(
        latestUserMessageAt ?? new Date(),
        resolvedTimeZone
      )}]\n${latestUserMessage}`
    )
  ]
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }

        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

function extractReasoningDelta(message: Pick<AIMessageChunk, 'additional_kwargs'>): string {
  const rawResponse = (message.additional_kwargs as { __raw_response?: unknown } | undefined)
    ?.__raw_response

  if (!rawResponse || typeof rawResponse !== 'object') {
    return ''
  }

  const choices = (rawResponse as { choices?: unknown }).choices

  if (!Array.isArray(choices)) {
    return ''
  }

  const firstChoice = choices[0]

  if (!firstChoice || typeof firstChoice !== 'object') {
    return ''
  }

  const delta = (firstChoice as { delta?: unknown }).delta

  if (!delta || typeof delta !== 'object') {
    return ''
  }

  const reasoningContent = (delta as { reasoning_content?: unknown }).reasoning_content

  return typeof reasoningContent === 'string' ? reasoningContent : ''
}

function emitReasoningDelta(handlers: ReasoningStreamHandlers | undefined, delta: string) {
  if (!handlers?.enabled || !delta) {
    return
  }

  if (!handlers.started || handlers.done) {
    handlers.started = true
    handlers.done = false
    logDeepThinking(handlers.content ? 'reasoning-resumed' : 'reasoning-started')
    handlers.onStart?.()
  }

  handlers.content += delta
  handlers.chunkCount += 1

  if (handlers.chunkCount === 1 || handlers.chunkCount % 20 === 0) {
    logDeepThinking('reasoning-delta', {
      chunkCount: handlers.chunkCount,
      deltaLength: delta.length,
      totalLength: handlers.content.length
    })
  }

  handlers.onDelta?.(delta)
}

function finishReasoning(handlers: ReasoningStreamHandlers | undefined) {
  if (!handlers?.enabled || handlers.done) {
    return
  }

  if (!handlers.started && !handlers.content.trim()) {
    handlers.done = true
    logDeepThinking('reasoning-empty', {
      chunkCount: handlers.chunkCount,
      totalLength: handlers.content.length
    })
    return
  }

  handlers.done = true
  logDeepThinking('reasoning-done', {
    chunkCount: handlers.chunkCount,
    totalLength: handlers.content.length,
    hasReasoningContent: handlers.content.trim().length > 0
  })
  handlers.onDone?.(handlers.content.trim())
}

function markFinalContentStarted(
  handlers: ReasoningStreamHandlers | undefined,
  deltaLength: number
) {
  if (!handlers?.enabled || handlers.finalContentStarted) {
    return
  }

  handlers.finalContentStarted = true
  logDeepThinking('final-content-started', {
    firstDeltaLength: deltaLength,
    reasoningLength: handlers.content.length,
    reasoningChunkCount: handlers.chunkCount
  })
}

function extractJsonText(content: string): string | null {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i)

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBraceIndex = content.indexOf('{')
  const lastBraceIndex = content.lastIndexOf('}')

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return content.slice(firstBraceIndex, lastBraceIndex + 1).trim()
  }

  return null
}

function sanitizeMemoryKey(
  key: string,
  fallbackPrefix: ExtractedMemory['type'],
  index: number
): string {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

  return normalized || `${fallbackPrefix}_memory_${index + 1}`
}

function sanitizeMemoryContent(content: string): string {
  return content
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 2000)
}

async function stringifyToolResult(result: unknown): Promise<string> {
  if (isAsyncIterable(result)) {
    let aggregated = ''

    for await (const chunk of result) {
      aggregated += normalizeContent(chunk)
    }

    return aggregated.trim()
  }

  if (typeof result === 'string') {
    return result
  }

  if (result == null) {
    return ''
  }

  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function parseRawToolCalls(rawToolCalls: unknown): ToolCallLike[] {
  if (!Array.isArray(rawToolCalls)) {
    return []
  }

  return rawToolCalls.flatMap((rawToolCall) => {
    if (!rawToolCall || typeof rawToolCall !== 'object' || !('function' in rawToolCall)) {
      return []
    }

    const toolCallFunction = rawToolCall.function

    if (!toolCallFunction || typeof toolCallFunction !== 'object') {
      return []
    }

    const name =
      'name' in toolCallFunction && typeof toolCallFunction.name === 'string'
        ? toolCallFunction.name
        : ''
    const rawArgs =
      'arguments' in toolCallFunction && typeof toolCallFunction.arguments === 'string'
        ? toolCallFunction.arguments
        : ''
    const id =
      'id' in rawToolCall && typeof rawToolCall.id === 'string' ? rawToolCall.id : undefined

    try {
      const args = JSON.parse(rawArgs)

      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return []
      }

      return [
        {
          name,
          args,
          id,
          type: 'tool_call'
        }
      ]
    } catch {
      return []
    }
  })
}

function isValidToolCall(toolCall: ToolCallLike): boolean {
  return (
    typeof toolCall.name === 'string' &&
    toolCall.name.trim().length > 0 &&
    typeof toolCall.id === 'string' &&
    toolCall.id.trim().length > 0 &&
    !!toolCall.args &&
    typeof toolCall.args === 'object' &&
    !Array.isArray(toolCall.args)
  )
}

function getCompleteToolCalls(toolCalls: ToolCallLike[]): ToolCallLike[] {
  return toolCalls.filter(isValidToolCall)
}

function hasToolCallSignals(
  message: Pick<AIMessageChunk, 'tool_calls' | 'tool_call_chunks' | 'additional_kwargs'>
): boolean {
  const rawToolCalls = (message.additional_kwargs as { tool_calls?: unknown } | undefined)
    ?.tool_calls

  return Boolean(
    message.tool_calls?.length ||
    message.tool_call_chunks?.length ||
    (Array.isArray(rawToolCalls) && rawToolCalls.length)
  )
}

function extractToolCalls(
  message: Pick<AIMessageChunk, 'tool_calls' | 'tool_call_chunks' | 'additional_kwargs'>
): ToolCallLike[] {
  const directToolCalls = getCompleteToolCalls(message.tool_calls ?? [])

  if (directToolCalls.length) {
    return directToolCalls
  }

  if (message.tool_call_chunks?.length) {
    const reparsedChunk = new AIMessageChunk({
      content: '',
      tool_call_chunks: message.tool_call_chunks
    })

    const chunkToolCalls = getCompleteToolCalls(reparsedChunk.tool_calls ?? [])

    if (chunkToolCalls.length) {
      return chunkToolCalls
    }
  }

  const rawToolCalls = parseRawToolCalls(
    (message.additional_kwargs as { tool_calls?: unknown } | undefined)?.tool_calls
  )

  const completeRawToolCalls = getCompleteToolCalls(rawToolCalls)

  if (completeRawToolCalls.length) {
    return completeRawToolCalls
  }

  if (hasToolCallSignals(message)) {
    console.log(
      '[tool-call] 检测到未完成的工具调用片段，暂不执行，等待后续聚合',
      dayjs().format('HH:mm:ss')
    )
  }

  return []
}

function formatToolCallNames(toolCalls: ToolCallLike[]): string {
  return toolCalls.map((toolCall) => toolCall.name || 'unknown').join(', ')
}

function getPrimaryToolName(toolCalls: ToolCallLike[]): string | undefined {
  return toolCalls.find((toolCall) => toolCall.name)?.name
}

function buildToolStatusPayload(
  toolCalls: ToolCallLike[],
  stage: 'tool' | 'reasoning'
): AssistantStatusPayload {
  const toolName = getPrimaryToolName(toolCalls)
  const metadata = toolName ? toolStatusMetadata[toolName] : undefined

  if (stage === 'tool') {
    return {
      stage,
      toolName,
      text: metadata?.invokingText ?? '正在调用工具处理问题...'
    }
  }

  return {
    stage,
    toolName,
    text: metadata?.completedText ?? '工具执行完成，正在整理答案...'
  }
}

function getToolArgsValidationError(
  toolName: string,
  toolArgs: Record<string, unknown>
): string | null {
  const currentTool = toolsByName.get(toolName)
  const schema = (
    currentTool as { schema?: { safeParse?: (input: unknown) => unknown } } | undefined
  )?.schema

  if (!schema || typeof schema.safeParse !== 'function') {
    return null
  }

  const result = schema.safeParse(toolArgs) as
    | { success: true }
    | { success: false; error: { issues: Array<{ message?: string }> } }

  if (result.success) {
    return null
  }

  return result.error.issues[0]?.message ?? '工具参数校验失败'
}

async function executeToolCalls(
  toolCalls: AIMessage['tool_calls'],
  context: {
    source: 'stream' | 'resolve'
    round: number
    onStatusChange?: (payload: AssistantStatusPayload) => void
    toolRuntimeContext?: ToolRuntimeContext
  },
  type: string
): Promise<ToolMessage[]> {
  const normalizedToolCalls = toolCalls ?? []

  console.log(
    `[${context.source}] 第 ${context.round + 1} 轮工具调用---${type}，数量=${normalizedToolCalls.length}，工具=${formatToolCallNames(normalizedToolCalls)}`,
    dayjs().format('HH:mm:ss')
  )

  context.onStatusChange?.(buildToolStatusPayload(normalizedToolCalls, 'tool'))

  const toolMessages: ToolMessage[] = []

  for (let index = 0; index < normalizedToolCalls.length; index += 1) {
    throwIfAborted(context.toolRuntimeContext?.signal)

    const toolCall = normalizedToolCalls[index]
    const currentTool = toolsByName.get(toolCall.name)

    if (!currentTool) {
      throw new AppError(500, `未找到工具：${toolCall.name}`, 'MODEL_TOOL_NOT_FOUND')
    }

    if (!toolCall.id) {
      throw new AppError(502, '模型返回的工具调用缺少 id', 'MODEL_TOOL_CALL_INVALID')
    }

    try {
      const validationError = getToolArgsValidationError(
        toolCall.name,
        (toolCall.args ?? {}) as Record<string, unknown>
      )

      if (validationError) {
        console.log(
          `[${context.source}] 跳过无效工具参数 ${index + 1}/${normalizedToolCalls.length}: ${toolCall.name}`,
          dayjs().format('HH:mm:ss'),
          toolCall.args
        )

        toolMessages.push(
          new ToolMessage({
            tool_call_id: toolCall.id,
            content: `工具参数校验失败：${validationError}。请重新生成完整参数后再调用该工具。`,
            status: 'error'
          })
        )
        continue
      }

      console.log(
        `[${context.source}] 开始执行工具 ${index + 1}/${normalizedToolCalls.length}: ${toolCall.name}`,
        dayjs().format('HH:mm:ss'),
        toolCall.args
      )
      const result = await waitForPromiseWithAbort(
        runWithToolContext(context.toolRuntimeContext, () =>
          currentTool.invoke(
            toolCall.args ?? {},
            context.toolRuntimeContext?.signal
              ? { signal: context.toolRuntimeContext.signal }
              : undefined
          )
        ),
        context.toolRuntimeContext?.signal
      )
      throwIfAborted(context.toolRuntimeContext?.signal)
      const content = await stringifyToolResult(result)
      console.log(
        `[${context.source}] 工具执行完成 ${index + 1}/${normalizedToolCalls.length}: ${toolCall.name}`,
        dayjs().format('HH:mm:ss')
      )

      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id,
          content,
          status: 'success'
        })
      )
    } catch (error) {
      if (isAbortError(error) || context.toolRuntimeContext?.signal?.aborted) {
        throw error
      }

      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id,
          content: error instanceof Error ? error.message : '工具执行失败',
          status: 'error'
        })
      )
    }
  }

  context.onStatusChange?.(buildToolStatusPayload(normalizedToolCalls, 'reasoning'))

  return toolMessages
}

async function resolveMessagesForStreaming(
  model: ChatModelWithTools,
  messages: BaseMessage[],
  onStatusChange?: (payload: AssistantStatusPayload) => void,
  signal?: AbortSignal,
  toolRuntimeContext?: ToolRuntimeContext
) {
  const currentMessages: BaseMessage[] = [...messages]

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round += 1) {
    const result = await model.invoke(currentMessages, signal ? { signal } : undefined)
    const toolCalls = extractToolCalls(result)

    if (!toolCalls.length) {
      return currentMessages
    }

    currentMessages.push(result)

    const toolMessages = await executeToolCalls(
      toolCalls,
      {
        source: 'resolve',
        round,
        onStatusChange,
        toolRuntimeContext
      },
      'resolveMessagesForStreaming'
    )
    currentMessages.push(...toolMessages)
  }

  throw new AppError(502, '模型工具调用次数过多', 'MODEL_TOOL_CALL_LIMIT')
}

async function* streamAssistantReplyWithTools(
  model: ChatModelWithTools,
  messages: BaseMessage[],
  onStatusChange?: (payload: AssistantStatusPayload) => void,
  signal?: AbortSignal,
  toolRuntimeContext?: ToolRuntimeContext,
  reasoningHandlers?: ReasoningStreamHandlers
): AsyncGenerator<string, AIMessageChunk, void> {
  const currentMessages: BaseMessage[] = [...messages]

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round += 1) {
    logDeepThinking('stream-round-start', {
      round: round + 1,
      messageCount: currentMessages.length,
      reasoningEnabled: reasoningHandlers?.enabled === true
    })
    const stream = await model.stream(currentMessages, signal ? { signal } : undefined)
    let fullChunk: AIMessageChunk | null = null

    for await (const chunk of stream) {
      fullChunk = fullChunk ? fullChunk.concat(chunk) : chunk

      emitReasoningDelta(reasoningHandlers, extractReasoningDelta(chunk))

      const delta = normalizeContent(chunk.content)

      if (!delta) {
        continue
      }

      finishReasoning(reasoningHandlers)
      markFinalContentStarted(reasoningHandlers, delta.length)
      yield delta
    }

    if (!fullChunk) {
      throw new AppError(502, '模型流式响应为空', 'MODEL_EMPTY_STREAM')
    }

    const toolCalls = extractToolCalls(fullChunk)

    if (!toolCalls.length) {
      if (hasToolCallSignals(fullChunk)) {
        console.log(
          `[stream] 流式工具调用片段不完整，改用 invoke 补全工具调用，第 ${round + 1} 轮`,
          dayjs().format('HH:mm:ss')
        )

        const resolvedResult = await model.invoke(currentMessages, signal ? { signal } : undefined)
        const resolvedToolCalls = extractToolCalls(resolvedResult)

        if (resolvedToolCalls.length) {
          finishReasoning(reasoningHandlers)
          currentMessages.push(resolvedResult)

          const toolMessages = await executeToolCalls(
            resolvedToolCalls,
            {
              source: 'stream',
              round,
              onStatusChange,
              toolRuntimeContext
            },
            'streamAssistantReplyWithTools:invoke-resolution'
          )
          currentMessages.push(...toolMessages)

          const drawImageIndex = resolvedToolCalls.findIndex((tc) => tc.name === 'drawImageTool')

          if (drawImageIndex >= 0 && toolMessages[drawImageIndex]) {
            const drawResult =
              typeof toolMessages[drawImageIndex].content === 'string'
                ? (toolMessages[drawImageIndex].content as string)
                : ''

            if (drawResult) {
              yield drawResult
            }

            return null as unknown as AIMessageChunk
          }

          continue
        }
      }

      return fullChunk
    }

    currentMessages.push(fullChunk)
    finishReasoning(reasoningHandlers)

    console.log(`[stream] 流式响应识别到工具调用，第 ${round + 1} 轮`, dayjs().format('HH:mm:ss'))
    const toolMessages = await executeToolCalls(
      toolCalls,
      {
        source: 'stream',
        round,
        onStatusChange,
        toolRuntimeContext
      },
      'streamAssistantReplyWithTools'
    )
    currentMessages.push(...toolMessages)

    const drawImageIndex = toolCalls.findIndex((tc) => tc.name === 'drawImageTool')

    if (drawImageIndex >= 0 && toolMessages[drawImageIndex]) {
      const drawResult =
        typeof toolMessages[drawImageIndex].content === 'string'
          ? (toolMessages[drawImageIndex].content as string)
          : ''

      if (drawResult) {
        for (const char of drawResult) {
          yield char
        }
      }

      return null as unknown as AIMessageChunk
    }
  }

  throw new AppError(502, '模型工具调用次数过多', 'MODEL_TOOL_CALL_LIMIT')
}

export async function* streamAssistantReply({
  userId,
  conversationId,
  latestUserMessage,
  latestUserMessageAt,
  timeZone,
  memoryContext,
  conversationHistory,
  projectContext,
  fileContext,
  onStatusChange,
  onReasoningStart,
  onReasoningDelta,
  onReasoningDone,
  modelOverride,
  speechStyle,
  deepThinkingEnabled,
  requestClientTool,
  signal
}: GenerateAssistantReplyParams): AsyncGenerator<string, string, void> {
  const toolRuntimeContext: ToolRuntimeContext = {
    userId,
    conversationId,
    signal,
    requestClientTool
  }

  let fullText = ''

  console.log('进入流 streamAssistantReply', dayjs().format('HH:mm:ss'))
  logDeepThinking('stream-assistant-reply-start', {
    conversationId,
    deepThinkingEnabled: deepThinkingEnabled === true,
    modelOverride,
    historyCount: conversationHistory.length,
    hasProjectContext: Boolean(projectContext),
    projectContextLength: projectContext?.length ?? 0,
    hasFileContext: Boolean(fileContext)
  })
  onStatusChange?.({
    stage: 'thinking',
    text: deepThinkingEnabled ? '正在深度思考...' : '正在思考问题...'
  })

  try {
    const reasoningHandlers: ReasoningStreamHandlers | undefined = deepThinkingEnabled
      ? {
          enabled: true,
          started: false,
          done: false,
          content: '',
          chunkCount: 0,
          finalContentStarted: false,
          onStart: onReasoningStart,
          onDelta: onReasoningDelta,
          onDone: onReasoningDone
        }
      : undefined

    const model = await getChatModel(modelOverride, tools, {
      enableThinking: deepThinkingEnabled === true
    })
    const messages = buildLangChainMessages({
      latestUserMessage,
      latestUserMessageAt,
      timeZone,
      memoryContext,
      conversationHistory,
      projectContext,
      fileContext,
      speechStyle
    })

    for await (const delta of streamAssistantReplyWithTools(
      model,
      messages,
      onStatusChange,
      signal,
      toolRuntimeContext,
      reasoningHandlers
    )) {
      fullText += delta
      yield delta
    }

    if (!fullText.trim()) {
      console.log(
        '[resolve] 流式阶段未产出文本，进入 fallback tool-resolution + stream',
        dayjs().format('HH:mm:ss')
      )
      const resolvedMessages = await resolveMessagesForStreaming(
        model,
        messages,
        onStatusChange,
        signal,
        toolRuntimeContext
      )

      const drawImageToolMsg = [...resolvedMessages]
        .reverse()
        .find(
          (m) =>
            m instanceof ToolMessage && typeof m.content === 'string' && m.content.startsWith('![')
        )

      if (drawImageToolMsg) {
        const drawResult = drawImageToolMsg.content as string
        for (const char of drawResult) {
          fullText += char
          yield char
        }
      } else {
        const fallbackStream = await model.stream(resolvedMessages, signal ? { signal } : undefined)

        for await (const chunk of fallbackStream) {
          emitReasoningDelta(reasoningHandlers, extractReasoningDelta(chunk))

          const delta = normalizeContent(chunk.content)

          if (!delta) {
            continue
          }

          finishReasoning(reasoningHandlers)
          markFinalContentStarted(reasoningHandlers, delta.length)
          fullText += delta
          yield delta
        }

        if (!fullText.trim()) {
          const fallbackResult = await model.invoke(
            resolvedMessages,
            signal ? { signal } : undefined
          )
          const fallbackContent = normalizeContent(fallbackResult.content)

          if (fallbackContent) {
            fullText = fallbackContent
            yield fallbackContent
          }
        }
      }
    }

    finishReasoning(reasoningHandlers)
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(502, '模型流式请求失败', 'MODEL_STREAM_FAILED')
  }

  if (!fullText.trim()) {
    throw new AppError(502, '模型返回了空响应', 'MODEL_EMPTY_RESPONSE')
  }

  return fullText
}

export async function generateConversationTitle({
  userMessage,
  modelOverride
}: GenerateConversationTitleParams): Promise<string> {
  const fallbackTitle = userMessage.trim().slice(0, 40) || '新会话'
  const model = await getBaseChatModel(modelOverride)
  const result = await model.invoke([
    new SystemMessage(
      [
        '你是一个对话标题生成助手。',
        '请根据用户发来的第一条消息，生成一个简洁准确的会话标题。',
        '要求：',
        '1. 只输出标题本身，不要解释，不要加引号，不要加标题前缀。',
        '2. 标题尽量控制在 12 个字以内，最多不超过 20 个字。',
        '3. 突出用户核心意图，避免空泛词语。'
      ].join('\n')
    ),
    new HumanMessage(userMessage)
  ])

  const content = normalizeContent(result.content)

  return sanitizeConversationTitle(content, fallbackTitle)
}

export async function generateMemoryCandidates({
  userMessage,
  existingMemories,
  modelOverride
}: GenerateMemoryCandidatesParams): Promise<ExtractedMemory[]> {
  const model = await getBaseChatModel(modelOverride)
  const existingMemoryText = existingMemories.length
    ? existingMemories
        .map((memory) => `- [${memory.type}] ${memory.key}: ${memory.content}`)
        .join('\n')
    : '无'

  const result = await model.invoke([
    new SystemMessage(
      [
        '你是一个长期记忆提取助手，负责从用户消息中提取值得长期保存的信息。',
        '你的任务是只保留未来多轮对话仍然有帮助、且相对稳定的重要用户信息。',
        '适合记忆的内容包括：用户偏好、常用语言、技术栈、项目背景、居住地、身高、职业、长期目标、稳定事实。',
        '不要记忆以下内容：一次性任务、临时计划、强时效信息、情绪发泄、没有复用价值的碎片信息、密码/密钥/身份证号/银行卡等敏感信息。',
        '如果用户表达的是对旧信息的修正，应复用同一个 key 以便覆盖更新。',
        'key 要简洁稳定，优先使用英文 snake_case，例如 preferred_language、location、height、tech_stack。',
        '最多输出 3 条记忆。',
        '输出必须是 JSON 对象，格式为：{"shouldRemember": boolean, "memories": [{"type": "profile|preference|summary|fact", "key": "...", "content": "..."}]}。',
        '如果没有值得记忆的内容，返回 {"shouldRemember": false, "memories": []}。',
        `已有长期记忆：\n${existingMemoryText}`
      ].join('\n')
    ),
    new HumanMessage(`请分析这条用户消息是否需要写入长期记忆：\n${userMessage}`)
  ])

  const content = normalizeContent(result.content)
  const jsonText = extractJsonText(content)

  if (!jsonText) {
    return []
  }

  try {
    const parsed = extractedMemorySchema.parse(JSON.parse(jsonText))

    if (!parsed.shouldRemember) {
      return []
    }

    return parsed.memories.map((memory, index) => ({
      type: memory.type,
      key: sanitizeMemoryKey(memory.key, memory.type, index),
      content: sanitizeMemoryContent(memory.content)
    }))
  } catch (error) {
    console.error('Failed to parse extracted memories:', error)
    return []
  }
}
