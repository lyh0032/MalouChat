import { MessageStatus, type Message as PrismaMessage, type Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'

import { prisma } from '../../lib/prisma'
import { generateConversationTitle, streamAssistantReply } from '../../lib/ai'
import { analyzeImage } from '../../lib/vision'
import { getPresignedUrl } from '../../utils/obs'
import { serializeMessageForClient, type ClientMessage } from '../../utils/message-files'
import { runLongTermMemoryGraph } from '../../lib/memory-graph'
import { AppError } from '../../utils/app-error'
import {
  ensureConversationOwnership,
  updateConversation
} from '../conversations/conversation.service'
import { getModelNameForLLM } from '../model-preferences/model-preference.service'
import { getUserSpeechStyleId } from '../user-preferences/user-preference.service'
import type {
  ClientToolResultBody,
  CreateMessageBody,
  RegenerateMessageBody,
  UpdateMessageBody
} from './message.schema'
import { buildConversationHistoryBeforeMessage } from './message-history'
import {
  buildKnowledgeBaseContext,
  ensureAccessibleKnowledgeBase
} from '../knowledge-bases/knowledge-base.service'
import { buildProjectPromptContext } from '../projects/project.service'
import { resolveTimeZone } from '../../utils/time-zone'
import { throwIfAborted } from '../../utils/abort'
import { finalizeFileReferences } from '../files/file-reference.service'

const STREAM_PERSIST_INTERVAL_MS = 400
const STREAM_PERSIST_MIN_CHARS = 80
const CLIENT_TOOL_TIMEOUT_MS = 30_000

type AssistantStatusPayload = {
  stage: 'thinking' | 'tool' | 'reasoning'
  text: string
  toolName?: string
}

type StreamMessageHandlers = {
  onUserMessage?: (payload: ClientMessage) => void
  onAssistantMessage?: (payload: ClientMessage) => void
  onAssistantStatus?: (payload: AssistantStatusPayload) => void
  onAssistantReasoningStart?: (payload: { messageId: string }) => void
  onAssistantReasoningDelta?: (payload: { messageId: string; delta: string }) => void
  onAssistantReasoningDone?: (payload: { messageId: string; content: string }) => void
  onAssistantDelta?: (delta: string) => void
  onAssistantDone?: (payload: { assistantMessage: ClientMessage; conversationId: string }) => void
  onAssistantCancelled?: (payload: {
    assistantMessage: ClientMessage
    conversationId: string
  }) => void
  onAssistantFailed?: (payload: {
    assistantMessage: ClientMessage
    conversationId: string
    message: string
  }) => void
  onClientToolRequest?: (payload: ClientToolRequestPayload) => void
}

type ClientToolRequestPayload = {
  requestId: string
  conversationId: string
  messageId: string
  toolName: string
  params?: unknown
}

type PendingClientToolRequest = {
  payload: ClientToolRequestPayload
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type StreamTask = {
  assistantMessage: PrismaMessage
  userId: string
  latestUserMessage: string
  latestUserMessageAt: Date
  timeZone: string
  existingMemories: MessageGenerationContext['memories']
  modelOverride?: string
  speechStyle?: string
  memoryContext: string[]
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt?: Date
  }>
  projectContext?: string
  fileContext?: string
  subscribers: Set<StreamMessageHandlers>
  latestStatus: AssistantStatusPayload | null
  reasoningContent: string
  reasoningDone: boolean
  deepThinkingEnabled: boolean
  abortController: AbortController
  cancelRequested: boolean
  completion: Promise<void>
  resolveCompletion: () => void
  lastPersistedContent: string
  lastPersistedReasoningContent: string
  lastPersistedStatus: MessageStatus
  lastPersistedAt: number
  flushPromise: Promise<void>
  conversationMetadataTask: Promise<void>
  messageType: 'text' | 'image'
  pendingClientToolRequests: Map<string, PendingClientToolRequest>
  prepare?: (signal: AbortSignal) => Promise<StreamTaskPreparation>
}

const activeStreamTasks = new Map<string, StreamTask>()

function getStorageKeyFromGeneratedImageRef(ref: string) {
  if (ref.startsWith('storage-key:')) {
    return decodeURIComponent(ref.slice('storage-key:'.length))
  }

  try {
    const parsedUrl = new URL(ref, 'http://local')
    if (parsedUrl.pathname !== '/api/files/url') {
      return null
    }

    return parsedUrl.searchParams.get('key')
  } catch {
    return null
  }
}

type MessageGenerationContext = {
  history: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  memories: Array<{
    id: string
    type: 'profile' | 'preference' | 'summary' | 'fact'
    key: string
    content: string
  }>
  memoryContext: string[]
}

type StreamTaskPreparation = {
  existingMemories: MessageGenerationContext['memories']
  modelOverride?: string
  speechStyle?: string
  memoryContext: string[]
  conversationHistory: StreamTask['conversationHistory']
  conversationMetadataTask: Promise<void>
  projectContext?: string
  fileContext?: string
}

/** 加载会话历史 + 用户长期记忆，组装成 LLM 上下文 */
async function loadMessageGenerationContext(userId: string, conversationId: string) {
  const [history, memories] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20
    })
  ])

  return {
    history,
    memories: memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      key: memory.key,
      content: memory.content
    })),
    memoryContext: memories.map((memory) => `【${memory.type}】${memory.key}: ${memory.content}`)
  } satisfies MessageGenerationContext
}

async function updateConversationMetadata(
  userId: string,
  conversationId: string,
  options?: {
    firstUserInput?: string
    shouldGenerateTitle?: boolean
    modelOverride?: string
  }
) {
  if (options?.shouldGenerateTitle && options.firstUserInput?.trim()) {
    const generatedTitle = await generateConversationTitle({
      userMessage: options.firstUserInput,
      modelOverride: options.modelOverride
    })

    await updateConversation(userId, conversationId, {
      title: generatedTitle
    })

    return
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date()
    }
  })
}

function scheduleConversationMetadataUpdate(
  userId: string,
  conversationId: string,
  options?: {
    firstUserInput?: string
    shouldGenerateTitle?: boolean
    modelOverride?: string
  }
) {
  return updateConversationMetadata(userId, conversationId, options).catch((error) => {
    console.error('Failed to update conversation metadata:', error)
  })
}

function scheduleUserMemoryExtraction(
  userId: string,
  payload: {
    userMessage: string
    existingMemories: MessageGenerationContext['memories']
    modelOverride?: string
  }
) {
  void (async () => {
    const result = await runLongTermMemoryGraph({
      userId,
      userMessage: payload.userMessage,
      existingMemories: payload.existingMemories,
      modelOverride: payload.modelOverride
    })

    console.log('Auto memory graph completed:', result.persistResult)
  })().catch((error) => {
    console.error('Failed to extract user memories:', error)
  })
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function cloneMessage(message: PrismaMessage): PrismaMessage {
  return {
    ...message,
    createdAt: new Date(message.createdAt),
    updatedAt: new Date(message.updatedAt)
  }
}

/** 向 task 所有 subscriber 广播事件 */
function broadcastToTask(task: StreamTask, callback: (handlers: StreamMessageHandlers) => void) {
  for (const handlers of task.subscribers) {
    try {
      callback(handlers)
    } catch (error) {
      console.error('Failed to broadcast stream event:', error)
    }
  }
}

/** 注册 subscriber，新连接可选重播已有消息 */
function subscribeToTask(
  task: StreamTask,
  handlers: StreamMessageHandlers,
  options?: { replayAssistantMessage?: boolean }
) {
  task.subscribers.add(handlers)

  if (options?.replayAssistantMessage) {
    handlers.onAssistantMessage?.(serializeMessageForClient(cloneMessage(task.assistantMessage)))

    if (task.latestStatus && task.assistantMessage.status === MessageStatus.generating) {
      handlers.onAssistantStatus?.(task.latestStatus)
    }

    if (task.deepThinkingEnabled && task.reasoningContent) {
      handlers.onAssistantReasoningStart?.({ messageId: task.assistantMessage.id })

      if (task.reasoningDone) {
        handlers.onAssistantReasoningDone?.({
          messageId: task.assistantMessage.id,
          content: task.reasoningContent
        })
      } else if (task.reasoningContent) {
        handlers.onAssistantReasoningDelta?.({
          messageId: task.assistantMessage.id,
          delta: task.reasoningContent
        })
      }
    }
  }

  for (const pending of task.pendingClientToolRequests.values()) {
    handlers.onClientToolRequest?.(pending.payload)
  }

  return () => {
    task.subscribers.delete(handlers)
  }
}

function waitForAbort(signal?: AbortSignal) {
  if (!signal) {
    return new Promise<void>(() => undefined)
  }

  if (signal.aborted) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** 等待 task 完成（比赛 task.completion 与客户端断开） */
async function waitForTaskSubscription(
  task: StreamTask,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal,
  options?: { replayAssistantMessage?: boolean }
) {
  if (signal?.aborted) {
    return
  }

  const unsubscribe = subscribeToTask(task, handlers, options)

  try {
    await Promise.race([task.completion, waitForAbort(signal)])
  } finally {
    unsubscribe()
  }
}

/**
 * 持久化流式消息内容到 DB
 * - force=true：写入最终内容（streaming 已结束），可安全替换 task.assistantMessage
 * - force=false：rate-limit 控制写入频率，回调中只更新 tracking 变量，不覆写内存中的消息对象
 */
async function persistTaskMessage(task: StreamTask, force = false) {
  const contentChanged = task.assistantMessage.content !== task.lastPersistedContent
  const reasoningChanged = task.reasoningContent !== task.lastPersistedReasoningContent
  const statusChanged = task.assistantMessage.status !== task.lastPersistedStatus

  if (!force) {
    if (!contentChanged && !reasoningChanged && !statusChanged) {
      return
    }

    const charDiff = task.assistantMessage.content.length - task.lastPersistedContent.length
    const reasoningCharDiff = task.reasoningContent.length - task.lastPersistedReasoningContent.length

    if (
      Date.now() - task.lastPersistedAt < STREAM_PERSIST_INTERVAL_MS &&
      charDiff + reasoningCharDiff < STREAM_PERSIST_MIN_CHARS &&
      !statusChanged
    ) {
      return
    }
  }

  if (force) {
    const finalContent = task.assistantMessage.content
    const finalStatus = task.assistantMessage.status

    await task.flushPromise.catch(() => {})

    const persisted = await prisma.message.update({
      where: { id: task.assistantMessage.id },
      data: {
        content: finalContent,
        status: finalStatus,
        type: task.messageType,
        deepThinkingEnabled: task.deepThinkingEnabled,
        reasoningContent: task.reasoningContent,
        fileList: (task.assistantMessage as any).fileList ?? undefined
      }
    })

    task.assistantMessage = persisted
    task.lastPersistedContent = persisted.content
    task.lastPersistedReasoningContent = task.reasoningContent
    task.lastPersistedStatus = persisted.status
    task.lastPersistedAt = Date.now()
    return
  }

  task.flushPromise = task.flushPromise.then(async () => {
    const contentToPersist = task.assistantMessage.content
    const statusToPersist = task.assistantMessage.status

    await prisma.message.update({
      where: { id: task.assistantMessage.id },
      data: {
        content: contentToPersist,
        status: statusToPersist,
        deepThinkingEnabled: task.deepThinkingEnabled,
        reasoningContent: task.reasoningContent
      }
    })

    task.lastPersistedContent = contentToPersist
    task.lastPersistedReasoningContent = task.reasoningContent
    task.lastPersistedStatus = statusToPersist
    task.lastPersistedAt = Date.now()
  })

  await task.flushPromise
}

/** 用户取消：持久化 → 广播 cancelled → 后台标题生成 */
async function finalizeTaskAsCancelled(task: StreamTask) {
  task.latestStatus = null
  rejectPendingClientToolRequests(task, '流式任务已取消')
  task.assistantMessage = {
    ...task.assistantMessage,
    status: MessageStatus.cancelled,
    updatedAt: new Date()
  }

  try {
    await persistTaskMessage(task, true)
  } catch (persistError) {
    console.error('Failed to persist cancelled message:', persistError)
  }

  broadcastToTask(task, (handlers) => {
    handlers.onAssistantCancelled?.({
      assistantMessage: serializeMessageForClient(cloneMessage(task.assistantMessage)),
      conversationId: task.assistantMessage.conversationId
    })
  })

  void task.conversationMetadataTask.catch((metaError) => {
    console.error('Failed to update conversation metadata:', metaError)
  })
}

/** 异常失败：持久化 → 广播 failed → 后台标题生成 */
async function finalizeTaskAsFailed(task: StreamTask, error: unknown) {
  task.latestStatus = null
  rejectPendingClientToolRequests(task, '流式任务已失败')
  task.assistantMessage = {
    ...task.assistantMessage,
    status: MessageStatus.failed,
    updatedAt: new Date()
  }

  try {
    await persistTaskMessage(task, true)
  } catch (persistError) {
    console.error('Failed to persist failed message:', persistError)
  }

  const message = error instanceof Error ? error.message : '流式消息处理失败'

  broadcastToTask(task, (handlers) => {
    handlers.onAssistantFailed?.({
      assistantMessage: serializeMessageForClient(cloneMessage(task.assistantMessage)),
      conversationId: task.assistantMessage.conversationId,
      message
    })
  })

  try {
    await task.conversationMetadataTask
  } catch (metaError) {
    console.error('Failed to update conversation metadata:', metaError)
  }
}

/** 正常完成：持久化 → 立即广播 assistant-done → 后台记忆提取 + 标题生成 */
async function finalizeTaskAsCompleted(task: StreamTask) {
  task.latestStatus = null
  rejectPendingClientToolRequests(task, '流式任务已完成')

  const imageMatch = task.assistantMessage.content.match(/!\[(.*?)\]\((\S+?)\)/)
  const imageStorageKey = imageMatch ? getStorageKeyFromGeneratedImageRef(imageMatch[2]) : null

  if (imageMatch && imageStorageKey) {
    const [, alt] = imageMatch
    const fileList = [
      {
        name: alt || '生成的图片',
        storageKey: imageStorageKey,
        kind: 'image',
        size: 0
      }
    ]
    ;(task.assistantMessage as any).fileList = fileList
    task.messageType = 'image'
    task.assistantMessage.content = `用户要求${alt ? `生成图片「${alt}」` : '生成图片'}，已展示给用户。`
  } else {
    task.messageType = 'text'
  }

  task.assistantMessage = {
    ...task.assistantMessage,
    status: MessageStatus.completed,
    updatedAt: new Date()
  }

  try {
    await persistTaskMessage(task, true)
  } catch (persistError) {
    console.error('Failed to persist completed message:', persistError)
  }

  broadcastToTask(task, (handlers) => {
    handlers.onAssistantDone?.({
      assistantMessage: serializeMessageForClient(cloneMessage(task.assistantMessage)),
      conversationId: task.assistantMessage.conversationId
    })
  })

  scheduleUserMemoryExtraction(task.userId, {
    userMessage: task.latestUserMessage,
    existingMemories: task.existingMemories,
    modelOverride: task.modelOverride
  })

  try {
    await task.conversationMetadataTask
  } catch (metaError) {
    console.error('Failed to update conversation metadata:', metaError)
  }
}

/**
 * 流式主循环（异步，void 执行）：
 * 1. 消费 LLM stream，每个 delta 拼接到 content 并广播
 * 2. 周期性 persist 到 DB（非 force，不覆写内存消息）
 * 3. stream 结束后根据结果进入 completed / cancelled / failed
 */
function startStreamTask(task: StreamTask) {
  void (async () => {
    try {
      if (task.prepare) {
        const prepared = await task.prepare(task.abortController.signal)
        throwIfAborted(task.abortController.signal)
        task.existingMemories = prepared.existingMemories
        task.modelOverride = prepared.modelOverride
        task.speechStyle = prepared.speechStyle
        task.memoryContext = prepared.memoryContext
        task.conversationHistory = prepared.conversationHistory
        task.conversationMetadataTask = prepared.conversationMetadataTask
        task.projectContext = prepared.projectContext
        task.fileContext = prepared.fileContext
      }

      const stream = streamAssistantReply({
        userId: task.userId,
        conversationId: task.assistantMessage.conversationId,
        latestUserMessage: task.latestUserMessage,
        latestUserMessageAt: task.latestUserMessageAt,
        timeZone: task.timeZone,
        conversationHistory: task.conversationHistory,
        memoryContext: task.memoryContext,
        projectContext: task.projectContext,
        fileContext: task.fileContext,
        requestClientTool: (toolName, params) => requestClientTool(task, toolName, params),
        modelOverride: task.modelOverride,
        speechStyle: task.speechStyle,
        deepThinkingEnabled: task.deepThinkingEnabled,
        signal: task.abortController.signal,
        onStatusChange(payload) {
          if (task.cancelRequested) {
            return
          }

          task.latestStatus = payload
          broadcastToTask(task, (handlers) => {
            handlers.onAssistantStatus?.(payload)
          })
        },
        onReasoningStart() {
          if (task.cancelRequested) {
            return
          }

          task.latestStatus = {
            stage: 'thinking',
            text: '正在深度思考...'
          }
          console.log('[deep-thinking:sse] reasoning-start', {
            messageId: task.assistantMessage.id,
            subscriberCount: task.subscribers.size
          })
          broadcastToTask(task, (handlers) => {
            handlers.onAssistantReasoningStart?.({
              messageId: task.assistantMessage.id
            })
            handlers.onAssistantStatus?.(task.latestStatus!)
          })
        },
        onReasoningDelta(delta) {
          if (task.cancelRequested) {
            return
          }

          task.reasoningContent += delta
          if (task.reasoningContent.length === delta.length || task.reasoningContent.length % 1000 < delta.length) {
            console.log('[deep-thinking:sse] reasoning-delta', {
              messageId: task.assistantMessage.id,
              deltaLength: delta.length,
              totalLength: task.reasoningContent.length,
              subscriberCount: task.subscribers.size
            })
          }
          broadcastToTask(task, (handlers) => {
            handlers.onAssistantReasoningDelta?.({
              messageId: task.assistantMessage.id,
              delta
            })
          })

          void persistTaskMessage(task).catch((error) => {
            console.error('Failed to persist reasoning chunk:', error)
          })
        },
        onReasoningDone(content) {
          if (task.cancelRequested) {
            return
          }

          task.reasoningContent = content
          task.reasoningDone = true
          task.latestStatus = {
            stage: 'reasoning',
            text: '深度思考完成，正在组织回答...'
          }
          console.log('[deep-thinking:sse] reasoning-done', {
            messageId: task.assistantMessage.id,
            totalLength: task.reasoningContent.length,
            subscriberCount: task.subscribers.size
          })
          broadcastToTask(task, (handlers) => {
            handlers.onAssistantReasoningDone?.({
              messageId: task.assistantMessage.id,
              content
            })
            handlers.onAssistantStatus?.(task.latestStatus!)
          })

          void persistTaskMessage(task).catch((error) => {
            console.error('Failed to persist reasoning result:', error)
          })
        }
      })

      for await (const delta of stream) {
        if (task.cancelRequested) {
          break
        }

        task.assistantMessage = {
          ...task.assistantMessage,
          content: `${task.assistantMessage.content}${delta}`,
          updatedAt: new Date(),
          status: MessageStatus.generating
        }

        broadcastToTask(task, (handlers) => {
          handlers.onAssistantDelta?.(delta)
        })

        void persistTaskMessage(task).catch((error) => {
          console.error('Failed to persist streaming message chunk:', error)
        })
      }

      if (task.cancelRequested || task.abortController.signal.aborted) {
        await finalizeTaskAsCancelled(task)
        return
      }

      await finalizeTaskAsCompleted(task)
    } catch (error) {
      if (task.cancelRequested || isAbortError(error)) {
        await finalizeTaskAsCancelled(task)
        return
      }

      await finalizeTaskAsFailed(task, error)
    } finally {
      activeStreamTasks.delete(task.assistantMessage.id)
      task.resolveCompletion()
    }
  })()
}

/**
 * 创建 StreamTask 结构体，初始化 flushPromise 链，
 * 然后启动 startStreamTask 异步主循环
 */
function createStreamTask(params: {
  assistantMessage: PrismaMessage
  userId: string
  latestUserMessage: string
  latestUserMessageAt: Date
  timeZone: string
  existingMemories: MessageGenerationContext['memories']
  modelOverride?: string
  speechStyle?: string
  memoryContext: string[]
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt?: Date
  }>
  conversationMetadataTask: Promise<void>
  projectContext?: string
  fileContext?: string
  deepThinkingEnabled?: boolean
  prepare?: (signal: AbortSignal) => Promise<StreamTaskPreparation>
}) {
  let resolveCompletion: () => void = () => undefined

  const task: StreamTask = {
    assistantMessage: params.assistantMessage,
    userId: params.userId,
    latestUserMessage: params.latestUserMessage,
    latestUserMessageAt: params.latestUserMessageAt,
    timeZone: params.timeZone,
    existingMemories: params.existingMemories,
    modelOverride: params.modelOverride,
    speechStyle: params.speechStyle,
    memoryContext: params.memoryContext,
    conversationHistory: params.conversationHistory,
    projectContext: params.projectContext,
    fileContext: params.fileContext,
    subscribers: new Set(),
    latestStatus: null,
    reasoningContent: '',
    reasoningDone: false,
    deepThinkingEnabled: params.deepThinkingEnabled === true,
    abortController: new AbortController(),
    cancelRequested: false,
    completion: new Promise<void>((resolve) => {
      resolveCompletion = resolve
    }),
    resolveCompletion,
    lastPersistedContent: params.assistantMessage.content,
    lastPersistedReasoningContent: '',
    lastPersistedStatus: params.assistantMessage.status,
    lastPersistedAt: Date.now(),
    flushPromise: Promise.resolve(),
    conversationMetadataTask: params.conversationMetadataTask,
    messageType: 'text',
    pendingClientToolRequests: new Map(),
    prepare: params.prepare
  }

  activeStreamTasks.set(task.assistantMessage.id, task)
  console.log('[deep-thinking:sse] stream-task-start', {
    messageId: task.assistantMessage.id,
    conversationId: task.assistantMessage.conversationId,
    deepThinkingEnabled: task.deepThinkingEnabled
  })

  return task
}

async function startStreamTaskWithSubscription(
  task: StreamTask,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal,
  options?: { replayAssistantMessage?: boolean }
) {
  const subscription = waitForTaskSubscription(task, handlers, signal, options)
  startStreamTask(task)
  await subscription
}

function requestClientTool(task: StreamTask, toolName: string, params?: unknown) {
  if (task.cancelRequested || task.abortController.signal.aborted) {
    return Promise.reject(new Error('流式任务已取消'))
  }

  const requestId = randomUUID()

  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      task.pendingClientToolRequests.delete(requestId)
      console.warn('[client-tool] request timed out', {
        requestId,
        toolName,
        messageId: task.assistantMessage.id
      })
      reject(new Error('客户端工具执行超时'))
    }, CLIENT_TOOL_TIMEOUT_MS)

    const payload: ClientToolRequestPayload = {
      requestId,
      conversationId: task.assistantMessage.conversationId,
      messageId: task.assistantMessage.id,
      toolName,
      params
    }

    task.pendingClientToolRequests.set(requestId, {
      payload,
      resolve,
      reject,
      timeout
    })

    broadcastToTask(task, (handlers) => {
      handlers.onClientToolRequest?.(payload)
    })
  })
}

function rejectPendingClientToolRequests(task: StreamTask, reason: string) {
  for (const [requestId, pending] of task.pendingClientToolRequests) {
    clearTimeout(pending.timeout)
    pending.reject(new Error(reason))
    task.pendingClientToolRequests.delete(requestId)
  }
}

async function ensureNoGeneratingMessage(conversationId: string) {
  const existingGeneratingMessage = await prisma.message.findFirst({
    where: {
      conversationId,
      role: 'assistant',
      status: MessageStatus.generating
    },
    select: { id: true }
  })

  if (existingGeneratingMessage) {
    throw new AppError(
      409,
      '当前会话仍有消息在生成中，请先等待完成或手动停止',
      'MESSAGE_STREAM_BUSY'
    )
  }
}

async function getAssistantMessageOrThrow(
  userId: string,
  conversationId: string,
  messageId: string
) {
  await ensureConversationOwnership(userId, conversationId)

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversationId,
      role: 'assistant'
    }
  })

  if (!message) {
    throw new AppError(404, '消息不存在', 'NOT_FOUND')
  }

  return message
}

async function markOrphanGeneratingMessageAsFailed(messageId: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: {
      status: MessageStatus.failed
    }
  })
}

function buildFileListSnapshot(
  files: Array<{ id: string; originalName: string; storageKey: string; kind: string; size: number }>
) {
  return files.map((f) => ({
    id: f.id,
    name: f.originalName,
    storageKey: f.storageKey,
    kind: f.kind as 'image' | 'file',
    size: f.size
  }))
}

type FileContextRecord = {
  id: string
  originalName: string
  storageKey: string
  kind: string
  size: number
  textContent: string | null
  visionDescription: string | null
  processingStatus: string
}

async function loadFileContextRecords(
  userId: string,
  fileIds: string[] | undefined
): Promise<FileContextRecord[]> {
  if (!fileIds?.length) return []

  return prisma.fileUpload.findMany({
    where: {
      id: { in: fileIds },
      userId
    },
    select: {
      id: true,
      originalName: true,
      storageKey: true,
      kind: true,
      size: true,
      textContent: true,
      visionDescription: true,
      processingStatus: true
    }
  })
}

async function buildFileContext(
  conversationId: string,
  files: FileContextRecord[],
  userPrompt?: string,
  signal?: AbortSignal
): Promise<{ context: string; fileList: ReturnType<typeof buildFileListSnapshot> } | null> {
  if (!files.length) return null
  throwIfAborted(signal)
  const fileList = buildFileListSnapshot(files)
  const imageFiles = fileList.filter((f) => f.kind === 'image')
  const otherFiles = fileList.filter((f) => f.kind !== 'image')

  const parts: string[] = []
  parts.push('用户通过此消息上传了以下附件：')

  if (otherFiles.length > 0) {
    parts.push('\n文件列表：')
    for (const f of otherFiles) {
      const dbFile = files.find((db) => db.id === f.id)
      if (dbFile?.textContent) {
        if (dbFile.textContent.length > 2000) {
          if (dbFile.processingStatus === 'completed') {
            parts.push(
              `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）[fileId: ${f.id}] — 已建立索引。如需了解内容，用 semanticSearchTool（参数：{"fileId": "${f.id}", "query": "你想查什么"}）检索。不要用 readFileTool 读全文。`
            )
          } else if (dbFile.processingStatus === 'failed') {
            parts.push(
              `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）— 文件文本已提取，但索引建立失败；可基于下方摘录回答，不要调用 semanticSearchTool。`
            )
          } else {
            parts.push(
              `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）— 文件文本已提取，索引仍在处理中；可基于下方摘录回答，不要调用 semanticSearchTool。`
            )
          }
        } else {
          parts.push(`- ${f.name}（${(f.size / 1024).toFixed(1)} KB）— 内容已提取，见下方。`)
        }
      } else {
        const ext = dbFile?.originalName?.toLowerCase() ?? ''
        const isParseableButEmpty =
          ext.endsWith('.pdf') || ext.endsWith('.docx') || ext.endsWith('.xlsx')
        if (isParseableButEmpty) {
          parts.push(
            `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）— 文件内容为空，可能是扫描件或加密文档，无法提取文字。`
          )
        } else {
          parts.push(
            `- ${f.name}（${(f.size / 1024).toFixed(1)} KB）— 此类文件格式暂不支持内容读取，只能提供文件名和链接。`
          )
        }
      }
    }

    const smallTextFiles = files.filter(
      (f) =>
        f.textContent &&
        (f.textContent.length <= 2000 || f.processingStatus !== 'completed') &&
        f.kind !== 'image'
    )
    if (smallTextFiles.length > 0) {
      parts.push('\n以下是文本文件的内容或摘录：')
      for (const f of smallTextFiles) {
        const content =
          f.textContent && f.textContent.length > 2000
            ? `${f.textContent.slice(0, 2000)}\n...（后续内容需等待索引完成后检索）`
            : f.textContent
        parts.push(`\n--- ${f.originalName} ---\n${content}\n--- 文件结束 ---`)
      }
    }
  }

  if (imageFiles.length > 0) {
    const imageRecords = files.filter((f) => f.kind === 'image')
    const cached = imageRecords.filter((f) => f.visionDescription)
    const uncached = imageRecords.filter((f) => !f.visionDescription)
    const normalizedUserPrompt = userPrompt?.trim()
    const shouldUseRequestAwareVision = Boolean(normalizedUserPrompt)

    const descriptionParts: string[] = []

    parts.push('\n图片附件列表：')
    for (const f of imageFiles) {
      parts.push(`- ${f.name}（${(f.size / 1024).toFixed(1)} KB）[fileId: ${f.id}]`)
    }

    if (shouldUseRequestAwareVision) {
      console.log('[vision] building request-aware file context', {
        conversationId,
        imageCount: imageRecords.length,
        promptLength: normalizedUserPrompt!.length
      })

      const descriptions = await Promise.all(
        imageRecords.map(async (file) => {
          throwIfAborted(signal)
          const url = await getPresignedUrl(file.storageKey, { responseCacheControl: false })
          const description = await analyzeImage(url, normalizedUserPrompt, signal)

          if (description) {
            return `图片 ${file.originalName}（按本轮用户问题分析）：${description}`
          }

          if (file.visionDescription) {
            return `图片 ${file.originalName}（通用缓存分析）：${file.visionDescription}`
          }

          return ''
        })
      )

      descriptionParts.push(...descriptions.filter(Boolean))
    } else {
      for (const img of cached) {
        descriptionParts.push(`图片 ${img.originalName}：${img.visionDescription}`)
      }

      if (uncached.length > 0) {
        const descriptions = await Promise.all(
          uncached.map(async (file) => {
            throwIfAborted(signal)
            const url = await getPresignedUrl(file.storageKey, { responseCacheControl: false })
            const description = await analyzeImage(url, undefined, signal)

            if (description) {
              throwIfAborted(signal)
              await prisma.fileUpload.update({
                where: { id: file.id },
                data: { visionDescription: description }
              })
              return `图片 ${file.originalName}：${description}`
            }

            return ''
          })
        )

        descriptionParts.push(...descriptions.filter(Boolean))
      }
    }

    if (shouldUseRequestAwareVision && descriptionParts.length > 0) {
      parts.push(`\n图片分析结果（已结合用户本轮问题）：\n${descriptionParts.join('\n')}`)
    } else if (descriptionParts.length > 0) {
      parts.push(`\n图片分析结果：\n${descriptionParts.join('\n')}`)
    } else {
      parts.push(
        '\n图片分析结果暂不可用：系统已确认用户本轮上传了图片附件，但自动视觉分析没有返回内容。回答时不要说“没有看到附件”或“没有收到图片”，应说明当前无法完成图片内容识别，并建议用户重试或换一种方式描述图片。'
      )
    }
  }

  return { context: parts.join('\n'), fileList }
}

function combineSupplementContexts(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join('\n\n')
}

/** 流式消息入口：先持久化问答占位并注册任务，再在任务内准备上下文和调用模型。 */
export async function streamMessage(
  userId: string,
  conversationId: string,
  data: CreateMessageBody,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
) {
  await ensureConversationOwnership(userId, conversationId)
  await ensureNoGeneratingMessage(conversationId)
  await ensureAccessibleKnowledgeBase(userId, data.knowledgeBaseId)

  const [existingMessageCount, files] = await Promise.all([
    prisma.message.count({ where: { conversationId } }),
    loadFileContextRecords(userId, data.fileIds)
  ])
  const shouldGenerateTitle = existingMessageCount === 0
  const fileList = buildFileListSnapshot(files)

  const { userMessage, assistantMessage } = await prisma.$transaction(async (tx) => {
    const persistedUserMessage = await tx.message.create({
      data: {
        conversationId,
        knowledgeBaseId: data.knowledgeBaseId ?? null,
        role: 'user',
        content: data.content,
        fileList: fileList as unknown as Prisma.JsonArray
      }
    })
    const persistedAssistantMessage = await tx.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: MessageStatus.generating,
        deepThinkingEnabled: data.deepThinkingEnabled === true,
        reasoningContent: ''
      }
    })

    if (files.length) {
      await finalizeFileReferences(
        tx,
        userId,
        files.map((file) => file.id),
        conversationId,
        persistedUserMessage.id
      )
    }

    return {
      userMessage: persistedUserMessage,
      assistantMessage: persistedAssistantMessage
    }
  })

  const task = createStreamTask({
    assistantMessage,
    userId,
    latestUserMessage: data.content,
    latestUserMessageAt: userMessage.createdAt,
    timeZone: resolveTimeZone(data.timeZone),
    existingMemories: [],
    memoryContext: [],
    conversationHistory: [],
    conversationMetadataTask: Promise.resolve(),
    deepThinkingEnabled: data.deepThinkingEnabled === true,
    async prepare(taskSignal) {
      const [fileContextResult, knowledgeBaseContext, projectContext, generationContext, preferredModel, speechStyle] =
        await Promise.all([
          buildFileContext(conversationId, files, data.content, taskSignal),
          buildKnowledgeBaseContext(userId, data.knowledgeBaseId, data.content),
          buildProjectPromptContext(userId, conversationId),
          loadMessageGenerationContext(userId, conversationId),
          getModelNameForLLM(userId),
          getUserSpeechStyleId(userId)
        ])
      throwIfAborted(taskSignal)

      return {
        existingMemories: generationContext.memories,
        modelOverride: preferredModel,
        speechStyle,
        memoryContext: generationContext.memoryContext,
        conversationHistory: generationContext.history
          .filter((message) => message.id !== userMessage.id && message.id !== assistantMessage.id)
          .map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt
          })),
        conversationMetadataTask: scheduleConversationMetadataUpdate(userId, conversationId, {
          firstUserInput: data.content,
          shouldGenerateTitle,
          modelOverride: preferredModel
        }),
        projectContext,
        fileContext: combineSupplementContexts(
          fileContextResult?.context,
          knowledgeBaseContext?.context
        )
      }
    }
  })

  handlers.onUserMessage?.(serializeMessageForClient(userMessage))
  handlers.onAssistantMessage?.(serializeMessageForClient(assistantMessage))

  await startStreamTaskWithSubscription(task, handlers, signal)

  return {
    conversationId,
    assistantMessageId: assistantMessage.id
  }
}

/**
 * 断流恢复 / 订阅已有消息：
 * - 如果 task 还在内存中活跃（activeStreamTasks），订阅并重播当前内容
 * - 如果 task 已结束，直接返回 DB 中消息的终态（completed / cancelled / failed）
 * - 如果 DB 里是 generating 但没有活跃 task，按孤消息处理标记为 failed
 */
export async function subscribeMessageStream(
  userId: string,
  conversationId: string,
  messageId: string,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
) {
  let assistantMessage = await getAssistantMessageOrThrow(userId, conversationId, messageId)
  const task = activeStreamTasks.get(messageId)

  if (task) {
    await waitForTaskSubscription(task, handlers, signal, {
      replayAssistantMessage: true
    })

    return {
      conversationId,
      assistantMessageId: messageId
    }
  }

  if (assistantMessage.status === MessageStatus.generating) {
    assistantMessage = await markOrphanGeneratingMessageAsFailed(messageId)
  }

  handlers.onAssistantMessage?.(serializeMessageForClient(assistantMessage))

  if (assistantMessage.status === MessageStatus.completed) {
    handlers.onAssistantDone?.({
      assistantMessage: serializeMessageForClient(assistantMessage),
      conversationId
    })
  } else if (assistantMessage.status === MessageStatus.cancelled) {
    handlers.onAssistantCancelled?.({
      assistantMessage: serializeMessageForClient(assistantMessage),
      conversationId
    })
  } else if (assistantMessage.status === MessageStatus.failed) {
    handlers.onAssistantFailed?.({
      assistantMessage: serializeMessageForClient(assistantMessage),
      conversationId,
      message: '流式输出已终止'
    })
  }

  return {
    conversationId,
    assistantMessageId: messageId
  }
}

/** 编辑用户消息 → 删除其后所有消息（截断会话） */
export async function updateMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  data: UpdateMessageBody
) {
  await ensureConversationOwnership(userId, conversationId)
  await ensureNoGeneratingMessage(conversationId)

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId }
  })

  if (!message) {
    throw new AppError(404, '消息不存在', 'NOT_FOUND')
  }

  if (message.role !== 'user') {
    throw new AppError(400, '只能编辑用户消息', 'CANNOT_EDIT_ASSISTANT_MESSAGE')
  }

  if (message.status !== MessageStatus.completed) {
    throw new AppError(400, '只能编辑已完成的消息', 'CANNOT_EDIT_GENERATING_MESSAGE')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.update({
      where: { id: messageId },
      data: { content: data.content }
    })

    await tx.message.deleteMany({
      where: {
        conversationId,
        createdAt: { gt: msg.createdAt }
      }
    })

    return msg
  })

  return serializeMessageForClient(updated)
}

/** 重新生成：基于指定 user 消息重新流式生成 assistant 回复 */
export async function regenerateMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  data: RegenerateMessageBody,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
) {
  const requestStartedAt = new Date()
  await ensureConversationOwnership(userId, conversationId)

  const userMessage = await prisma.message.findFirst({
    where: { id: messageId, conversationId, role: 'user' }
  })

  if (!userMessage) {
    throw new AppError(404, '用户消息不存在', 'NOT_FOUND')
  }

  await ensureNoGeneratingMessage(conversationId)

  const fileList = (userMessage as Record<string, unknown>).fileList as
    | Array<{ id?: string }>
    | undefined
    | null
  const fileIds = fileList?.map((f) => f.id).filter(Boolean) as string[] | undefined
  const files = await loadFileContextRecords(userId, fileIds)

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: '',
      status: MessageStatus.generating,
      deepThinkingEnabled: data.deepThinkingEnabled === true,
      reasoningContent: ''
    }
  })

  const task = createStreamTask({
    assistantMessage,
    userId,
    latestUserMessage: userMessage.content,
    latestUserMessageAt: requestStartedAt,
    timeZone: resolveTimeZone(data.timeZone),
    existingMemories: [],
    memoryContext: [],
    conversationHistory: [],
    conversationMetadataTask: Promise.resolve(),
    deepThinkingEnabled: data.deepThinkingEnabled === true,
    async prepare(taskSignal) {
      const [fileContextResult, knowledgeBaseContext, projectContext, generationContext, preferredModel, speechStyle] =
        await Promise.all([
          buildFileContext(conversationId, files, userMessage.content, taskSignal),
          buildKnowledgeBaseContext(
            userId,
            userMessage.knowledgeBaseId ?? undefined,
            userMessage.content
          ),
          buildProjectPromptContext(userId, conversationId),
          loadMessageGenerationContext(userId, conversationId),
          getModelNameForLLM(userId),
          getUserSpeechStyleId(userId)
        ])
      throwIfAborted(taskSignal)

      return {
        existingMemories: generationContext.memories,
        modelOverride: preferredModel,
        speechStyle,
        memoryContext: generationContext.memoryContext,
        conversationHistory: buildConversationHistoryBeforeMessage(
          generationContext.history,
          userMessage.id
        ),
        conversationMetadataTask: scheduleConversationMetadataUpdate(userId, conversationId),
        projectContext,
        fileContext: combineSupplementContexts(
          fileContextResult?.context,
          knowledgeBaseContext?.context
        )
      }
    }
  })

  handlers.onAssistantMessage?.(serializeMessageForClient(assistantMessage))
  await startStreamTaskWithSubscription(task, handlers, signal)

  return {
    conversationId,
    assistantMessageId: assistantMessage.id
  }
}

export async function deleteMessage(userId: string, conversationId: string, messageId: string) {
  await ensureConversationOwnership(userId, conversationId)

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId }
  })

  if (!message) {
    throw new AppError(404, '消息不存在', 'NOT_FOUND')
  }

  if (message.status === MessageStatus.generating) {
    throw new AppError(400, '无法删除正在生成中的消息', 'CANNOT_DELETE_GENERATING_MESSAGE')
  }

  await prisma.message.delete({
    where: { id: messageId }
  })
}

/** 手动停止生成 */
export async function cancelMessageStream(
  userId: string,
  conversationId: string,
  messageId: string
) {
  const assistantMessage = await getAssistantMessageOrThrow(userId, conversationId, messageId)
  const task = activeStreamTasks.get(messageId)

  if (!task) {
    if (assistantMessage.status === MessageStatus.generating) {
      const cancelledMessage = await prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          status: MessageStatus.cancelled
        }
      })

      return serializeMessageForClient(cancelledMessage)
    }

    return serializeMessageForClient(assistantMessage)
  }

  task.cancelRequested = true
  task.abortController.abort()
  await task.completion

  const finalMessage = await getAssistantMessageOrThrow(userId, conversationId, messageId)
  return serializeMessageForClient(finalMessage)
}

export async function completeClientToolResult(
  userId: string,
  conversationId: string,
  messageId: string,
  data: ClientToolResultBody
) {
  await getAssistantMessageOrThrow(userId, conversationId, messageId)

  const task = activeStreamTasks.get(messageId)

  if (!task) {
    throw new AppError(404, '客户端工具请求已失效', 'CLIENT_TOOL_TASK_NOT_FOUND')
  }

  const pending = task.pendingClientToolRequests.get(data.requestId)

  if (!pending) {
    throw new AppError(404, '客户端工具请求不存在或已超时', 'CLIENT_TOOL_REQUEST_NOT_FOUND')
  }

  clearTimeout(pending.timeout)
  task.pendingClientToolRequests.delete(data.requestId)

  if (data.success) {
    pending.resolve(data.result)
  } else {
    console.warn('[client-tool] result failed', {
      requestId: data.requestId,
      messageId,
      success: false,
      error: data.error
    })
    pending.reject(new Error(data.error || '客户端工具执行失败'))
  }

  return { accepted: true }
}
