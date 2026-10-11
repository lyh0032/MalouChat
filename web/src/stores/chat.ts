import { create } from 'zustand'

import {
  cancelMessageStream,
  createConversation,
  deleteConversation,
  deleteMessage as deleteMessageApi,
  fetchConversationDetail,
  fetchConversations,
  regenerateMessage,
  renameConversation,
  streamMessage,
  submitClientToolResult,
  subscribeMessageStream,
  toggleConversationPin,
  updateConversationKnowledgeBase,
  updateConversationProject,
  updateMessage as updateMessageApi
} from '../api/chat'
import type { ApiErrorResponse } from '../types/api'
import type {
  ConversationSummary,
  CreateConversationResponse,
  Message,
  MessageFile,
  StreamAssistantStatus
} from '../types/chat'
import { notifyAssistantCompletion, requestAssistantNotificationPermission } from '../utils/assistant-notification'
import { executeClientTool, type ClientToolRequest } from '../utils/client-tools'
import { getRegenerationDeepThinkingEnabled } from '../utils/message-edit'
import { findMessageInsertionIndex } from '../utils/message-order'
import { getBrowserTimeZone } from '../utils/time-zone'
import { toast } from '../utils/toast'
import { useKnowledgeBaseStore } from './knowledge-base'
import { useProjectStore } from './project'

const CONVERSATION_STATUS_POLL_INTERVAL_MS = 2000
const OPTIMISTIC_GENERATING_TIMEOUT_MS = 15_000
const EARLY_STOP_LOOKUP_ATTEMPTS = 10
const EARLY_STOP_LOOKUP_INTERVAL_MS = 100

export type SendResult = {
  conversationId: string
  assistantMessageId?: string
  accepted: boolean
}

type ChatState = {
  conversations: ConversationSummary[]
  activeConversationId: string
  activeProjectId: string
  messages: Message[]
  isLoadingConversations: boolean
  isLoadingMessages: boolean
  isSending: boolean
  isStopping: boolean
  streamingStatusText: string
  streamingStatus: StreamAssistantStatus | null
  activeStreamingConversationId: string
  activeStreamingMessageId: string
  loadConversations: (silent?: boolean) => Promise<void>
  createConversation: (initialMessage?: string, knowledgeBaseId?: string | null, projectId?: string | null, consumeDraft?: boolean, preserveMessages?: boolean) => Promise<CreateConversationResponse>
  startNewConversation: () => void
  startNewProjectConversation: (projectId: string) => void
  selectConversation: (conversationId: string) => Promise<boolean>
  sendMessage: (content: string, fileIds?: string[], fileList?: MessageFile[], knowledgeBaseId?: string, deepThinkingEnabled?: boolean) => Promise<SendResult>
  stopStreaming: () => Promise<void>
  detachActiveStream: () => void
  resumeCurrentStream: () => void
  renameConversation: (id: string, title: string) => Promise<void>
  toggleConversationPin: (id: string, isPinned: boolean) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  moveConversationToProject: (id: string, projectId: string | null) => Promise<ConversationSummary>
  updateMessage: (id: string, content: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  saveConversationKnowledgeBase: (id: string | null) => Promise<void>
  resetChatState: () => void
}

let activeStreamAbortController: AbortController | null = null
let sendActionInFlight = false
let conversationStatusPollTimer: number | null = null
let conversationsRequestSequence = 0
let conversationSelectionSequence = 0
let conversationDetailAbortController: AbortController | null = null
let activeOptimisticUserMessageId = ''
const activeClientToolRequests = new Set<string>()
const optimisticGeneratingConversations = new Map<string, number>()

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function getApiErrorCode(error: unknown) {
  const payload = (error as { payload?: ApiErrorResponse | string | null })?.payload
  return typeof payload === 'object' && payload !== null ? payload.errorCode : undefined
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export const useChatStore = create<ChatState>((set, get) => {
  function upsertMessage(message: Message) {
    set((state) => {
      const index = state.messages.findIndex((item) => item.id === message.id)
      if (index >= 0) {
        const messages = [...state.messages]
        messages[index] = { ...messages[index], ...message }
        return { messages }
      }
      const messages = [...state.messages]
      messages.splice(findMessageInsertionIndex(messages, message), 0, message)
      return { messages }
    })
  }

  function updateMessageState(messageId: string, updater: (message: Message) => Message) {
    set((state) => ({
      messages: state.messages.map((message) => message.id === messageId ? updater(message) : message)
    }))
  }

  function clearConversationStatusPoll() {
    if (conversationStatusPollTimer !== null) window.clearTimeout(conversationStatusPollTimer)
    conversationStatusPollTimer = null
  }

  function scheduleConversationStatusPoll() {
    clearConversationStatusPoll()
    if (!get().conversations.some((conversation) => conversation.isGenerating)) return
    conversationStatusPollTimer = window.setTimeout(() => {
      conversationStatusPollTimer = null
      void get().loadConversations(true)
    }, CONVERSATION_STATUS_POLL_INTERVAL_MS)
  }

  function setConversationGenerating(
    conversationId: string,
    isGenerating: boolean,
    optimistic = false
  ) {
    if (optimistic && isGenerating) {
      optimisticGeneratingConversations.set(
        conversationId,
        Date.now() + OPTIMISTIC_GENERATING_TIMEOUT_MS
      )
    } else {
      optimisticGeneratingConversations.delete(conversationId)
    }
    set((state) => ({
      conversations: state.conversations.map((conversation) => conversation.id === conversationId
        ? { ...conversation, isGenerating }
        : conversation)
    }))
    scheduleConversationStatusPoll()
  }

  function invalidateConversationSelection() {
    conversationSelectionSequence += 1
    conversationDetailAbortController?.abort()
    conversationDetailAbortController = null
    set({ isLoadingMessages: false })
  }

  function clearActiveStream(controller?: AbortController) {
    if (controller && activeStreamAbortController !== controller) return
    activeStreamAbortController = null
    set({
      activeStreamingConversationId: '',
      activeStreamingMessageId: '',
      isSending: false,
      streamingStatusText: '',
      streamingStatus: null
    })
  }

  function detachActiveStream() {
    activeStreamAbortController?.abort()
    clearActiveStream()
  }

  function startActiveStream(conversationId: string, controller: AbortController, messageId = '') {
    activeStreamAbortController = controller
    set({
      activeStreamingConversationId: conversationId,
      activeStreamingMessageId: messageId,
      isSending: true
    })
  }

  function findGeneratingAssistantMessage() {
    return [...get().messages].reverse().find(
      (message) => message.role === 'assistant' && message.status === 'generating'
    )
  }

  async function handlePrecheckError(error: unknown, conversationId: string) {
    if (getApiErrorCode(error) !== 'KNOWLEDGE_BASE_NOT_ACCESSIBLE') return
    const kbStore = useKnowledgeBaseStore.getState()
    kbStore.clearSelectedKnowledgeBase()
    set((state) => ({
      conversations: state.conversations.map((conversation) => conversation.id === conversationId
        ? { ...conversation, knowledgeBaseId: null }
        : conversation)
    }))
    await Promise.all([kbStore.loadKnowledgeBases(true, true), get().loadConversations(true)])
  }

  function buildStreamHandlers(conversationId: string, controller: AbortController) {
    let pendingAssistantDelta = ''
    const pendingReasoningDeltas = new Map<string, string>()
    let pendingFrameId: number | null = null
    const isCurrent = () => activeStreamAbortController === controller

    function discardPendingDeltas() {
      pendingAssistantDelta = ''
      pendingReasoningDeltas.clear()
      if (pendingFrameId !== null) window.cancelAnimationFrame(pendingFrameId)
      pendingFrameId = null
    }

    function flushPendingDeltas() {
      pendingFrameId = null
      if (!isCurrent() || get().activeConversationId !== conversationId) {
        discardPendingDeltas()
        return
      }
      const updatedAt = new Date().toISOString()
      const assistantDelta = pendingAssistantDelta
      pendingAssistantDelta = ''
      const streamingMessageId = get().activeStreamingMessageId
      if (assistantDelta && streamingMessageId) {
        updateMessageState(streamingMessageId, (message) => ({
          ...message,
          content: `${message.content}${assistantDelta}`,
          status: 'generating',
          updatedAt
        }))
      }
      pendingReasoningDeltas.forEach((delta, messageId) => {
        updateMessageState(messageId, (message) => ({
          ...message,
          deepThinkingEnabled: true,
          reasoningContent: `${message.reasoningContent ?? ''}${delta}`,
          reasoningStatus: 'thinking',
          updatedAt
        }))
      })
      pendingReasoningDeltas.clear()
    }

    function scheduleFlush() {
      if (pendingFrameId === null) pendingFrameId = window.requestAnimationFrame(flushPendingDeltas)
    }

    function finalize(message: Message, shouldNotify = false) {
      discardPendingDeltas()
      if (!isCurrent() || get().activeConversationId !== conversationId) return
      setConversationGenerating(conversationId, false)
      upsertMessage(message)
      if (shouldNotify && message.status === 'completed') void notifyAssistantCompletion(message)
      if (get().activeStreamingMessageId === message.id) clearActiveStream(controller)
      void get().loadConversations(true)
    }

    function canHandleTool(request: ClientToolRequest) {
      if (request.conversationId !== conversationId) return false
      if (isCurrent()) return true
      return get().messages.some((message) =>
        message.id === request.messageId && message.conversationId === request.conversationId &&
        message.role === 'assistant' && message.status === 'generating')
    }

    return {
      onUserMessage(message: Message) {
        if (isCurrent() && get().activeConversationId === conversationId) upsertMessage(message)
      },
      onAssistantMessage(message: Message) {
        if (!isCurrent() || get().activeConversationId !== conversationId) return
        discardPendingDeltas()
        upsertMessage(message)
        setConversationGenerating(conversationId, message.status === 'generating')
        if (message.status === 'generating') {
          set({ activeStreamingMessageId: message.id, activeStreamingConversationId: conversationId, isSending: true })
        } else {
          clearActiveStream(controller)
        }
        void get().loadConversations(true)
      },
      onAssistantStatus(status: StreamAssistantStatus) {
        if (!isCurrent() || get().activeConversationId !== conversationId) return
        set({ streamingStatus: status, streamingStatusText: status.text })
        if (status.stage === 'tool' && status.toolName === 'drawImageTool' && get().activeStreamingMessageId) {
          updateMessageState(get().activeStreamingMessageId, (message) => ({ ...message, type: 'image' }))
        }
      },
      onAssistantReasoningStart({ messageId }: { messageId: string }) {
        if (!isCurrent() || get().activeConversationId !== conversationId) return
        set({ activeStreamingMessageId: messageId, streamingStatus: { stage: 'thinking', text: '正在深度思考...' }, streamingStatusText: '正在深度思考...' })
        updateMessageState(messageId, (message) => ({ ...message, deepThinkingEnabled: true, reasoningContent: message.reasoningContent ?? '', reasoningStatus: 'thinking' }))
      },
      onAssistantReasoningDelta({ messageId, delta }: { messageId: string; delta: string }) {
        if (!isCurrent() || get().activeConversationId !== conversationId) return
        pendingReasoningDeltas.set(messageId, `${pendingReasoningDeltas.get(messageId) ?? ''}${delta}`)
        scheduleFlush()
      },
      onAssistantReasoningDone({ messageId, content }: { messageId: string; content: string }) {
        if (!isCurrent() || get().activeConversationId !== conversationId) return
        pendingReasoningDeltas.delete(messageId)
        set({ streamingStatus: { stage: 'reasoning', text: '深度思考完成，正在组织回答...' }, streamingStatusText: '深度思考完成，正在组织回答...' })
        updateMessageState(messageId, (message) => ({ ...message, deepThinkingEnabled: true, reasoningContent: content, reasoningStatus: 'done', updatedAt: new Date().toISOString() }))
      },
      onAssistantDelta(delta: string) {
        if (!isCurrent() || get().activeConversationId !== conversationId || !get().activeStreamingMessageId) return
        set({ streamingStatus: null, streamingStatusText: '' })
        pendingAssistantDelta += delta
        scheduleFlush()
      },
      onAssistantDone(payload: { assistantMessage: Message; conversationId: string }) {
        if (payload.conversationId === conversationId) finalize(payload.assistantMessage, true)
      },
      onAssistantCancelled(payload: { assistantMessage: Message; conversationId: string }) {
        if (payload.conversationId === conversationId) finalize(payload.assistantMessage)
      },
      onAssistantFailed(payload: { assistantMessage: Message; conversationId: string }) {
        if (payload.conversationId === conversationId) finalize(payload.assistantMessage)
      },
      async onClientToolRequest(request: ClientToolRequest) {
        if (!canHandleTool(request) || activeClientToolRequests.has(request.requestId)) return
        activeClientToolRequests.add(request.requestId)
        try {
          const result = await executeClientTool(request)
          await submitClientToolResult(request.conversationId, request.messageId, { requestId: request.requestId, success: true, result })
        } catch (error) {
          try {
            await submitClientToolResult(request.conversationId, request.messageId, {
              requestId: request.requestId,
              success: false,
              error: error instanceof Error ? error.message : '客户端工具执行失败'
            })
          } catch (submitError) {
            console.error('[client-tool] Failed to submit client tool error:', submitError)
          }
        } finally {
          activeClientToolRequests.delete(request.requestId)
        }
      }
    }
  }

  function resumeStreamIfNeeded(conversationId: string) {
    const generatingMessage = findGeneratingAssistantMessage()
    if (!generatingMessage) {
      clearActiveStream()
      return
    }
    detachActiveStream()
    const controller = new AbortController()
    startActiveStream(conversationId, controller, generatingMessage.id)
    set({
      streamingStatus: { stage: 'thinking', text: generatingMessage.content ? '正在继续输出...' : '正在恢复输出...' },
      streamingStatusText: generatingMessage.content ? '' : '正在恢复输出...'
    })
    void subscribeMessageStream(conversationId, generatingMessage.id, buildStreamHandlers(conversationId, controller), controller.signal)
      .catch((error) => {
        if (!isAbortError(error)) {
          updateMessageState(generatingMessage.id, (message) => message.status === 'generating' ? { ...message, status: 'failed' } : message)
          console.error('Failed to resume message stream:', error)
        }
      })
      .finally(() => {
        if (activeStreamAbortController === controller) clearActiveStream()
      })
  }

  async function performSendMessage(content: string, fileIds?: string[], fileList?: MessageFile[], knowledgeBaseId?: string, deepThinkingEnabled?: boolean): Promise<SendResult> {
    let conversationId = get().activeConversationId
    const existingMessageIds = new Set(get().messages.map((message) => message.id))
    detachActiveStream()
    const controller = new AbortController()
    startActiveStream(conversationId, controller)
    const tempId = `temp-user-${Date.now()}`
    const now = new Date().toISOString()
    activeOptimisticUserMessageId = tempId
    set((state) => ({
      streamingStatus: { stage: 'thinking', text: '正在思考问题...' },
      streamingStatusText: '正在思考问题...',
      messages: [...state.messages, { id: tempId, conversationId, role: 'user', content, fileList: fileList ?? [], status: 'completed', createdAt: now, updatedAt: now }]
    }))
    if (conversationId) setConversationGenerating(conversationId, true, true)

    const removeOptimisticMessage = () => {
      if (activeOptimisticUserMessageId === tempId) activeOptimisticUserMessageId = ''
      set((state) => ({ messages: state.messages.filter((message) => message.id !== tempId) }))
    }
    const isCurrent = () => activeStreamAbortController === controller
    let taskEstablished = false
    let streamStarted = false

    try {
      if (!conversationId) {
        const created = await get().createConversation(
          content,
          knowledgeBaseId ?? null,
          get().activeProjectId || null,
          !get().activeProjectId,
          true
        )
        conversationId = created.conversation.id
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === tempId ? { ...message, conversationId } : message
          )
        }))
        if (!isCurrent()) {
          setConversationGenerating(conversationId, false)
          removeOptimisticMessage()
          return { conversationId, accepted: false }
        }
        startActiveStream(conversationId, controller)
        setConversationGenerating(conversationId, true, true)
      }
      if (!conversationId) throw new Error('会话创建失败，请重试')

      const input = { content, fileIds, knowledgeBaseId, deepThinkingEnabled, timeZone: getBrowserTimeZone() }
      if (!isCurrent()) {
        setConversationGenerating(conversationId, false)
        removeOptimisticMessage()
        return { conversationId, accepted: false }
      }

      const handlers = buildStreamHandlers(conversationId, controller)
      handlers.onUserMessage = (message: Message) => {
        taskEstablished = true
        if (activeOptimisticUserMessageId === tempId) activeOptimisticUserMessageId = ''
        set((state) => ({ messages: state.messages.map((item) => item.id === tempId ? message : item) }))
        void get().loadConversations(true)
      }
      streamStarted = true
      const result = await streamMessage(conversationId, input, handlers, controller.signal)
      return { ...result, accepted: true }
    } catch (error) {
      if (isAbortError(error)) {
        return {
          conversationId,
          assistantMessageId: get().activeStreamingMessageId || undefined,
          accepted: streamStarted
        }
      }
      const apiErrorCode = getApiErrorCode(error)
      const failedMessageId = get().activeStreamingMessageId
      if (apiErrorCode) {
        if (failedMessageId) updateMessageState(failedMessageId, (message) => message.status === 'generating' ? { ...message, status: 'failed' } : message)
        removeOptimisticMessage()
        toast.error(error instanceof Error ? error.message : '发送消息失败')
        await handlePrecheckError(error, conversationId)
        setConversationGenerating(conversationId, false)
        await get().loadConversations(true)
      } else if (get().activeConversationId === conversationId) {
        await get().selectConversation(conversationId)
        taskEstablished = get().messages.some(
          (message) =>
            message.role === 'user' &&
            message.content === content &&
            !existingMessageIds.has(message.id)
        )
        setConversationGenerating(
          conversationId,
          get().messages.some(
            (message) => message.role === 'assistant' && message.status === 'generating'
          )
        )
        await get().loadConversations(true)
      }
      console.error('Stream message error:', error)
      return {
        conversationId,
        assistantMessageId: failedMessageId || undefined,
        accepted: apiErrorCode ? false : taskEstablished
      }
    } finally {
      if (activeOptimisticUserMessageId === tempId) activeOptimisticUserMessageId = ''
      if (activeStreamAbortController === controller) clearActiveStream()
    }
  }

  return {
    conversations: [],
    activeConversationId: '',
    activeProjectId: '',
    messages: [],
    isLoadingConversations: false,
    isLoadingMessages: false,
    isSending: false,
    isStopping: false,
    streamingStatusText: '',
    streamingStatus: null,
    activeStreamingConversationId: '',
    activeStreamingMessageId: '',

    async loadConversations(silent = false) {
      const sequence = ++conversationsRequestSequence
      if (!silent) set({ isLoadingConversations: true })
      try {
        const now = Date.now()
        const conversations = (await fetchConversations()).map((conversation) => {
          const optimisticUntil = optimisticGeneratingConversations.get(conversation.id)
          if (conversation.isGenerating || (optimisticUntil && optimisticUntil <= now)) {
            optimisticGeneratingConversations.delete(conversation.id)
          }
          return optimisticUntil && optimisticUntil > now && !conversation.isGenerating
            ? { ...conversation, isGenerating: true }
            : conversation
        })
        if (sequence === conversationsRequestSequence) set({ conversations })
      } finally {
        if (sequence === conversationsRequestSequence) {
          set({ isLoadingConversations: false })
          scheduleConversationStatusPoll()
        }
      }
    },

    startNewConversation() {
      invalidateConversationSelection()
      detachActiveStream()
      set({ activeConversationId: '', activeProjectId: '', messages: [], isLoadingMessages: false })
      useKnowledgeBaseStore.getState().clearSelectedKnowledgeBase()
    },

    startNewProjectConversation(projectId) {
      invalidateConversationSelection()
      detachActiveStream()
      set({ activeConversationId: '', activeProjectId: projectId, messages: [], isLoadingMessages: false })
      useKnowledgeBaseStore.getState().clearSelectedKnowledgeBase()
    },

    async createConversation(initialMessage, knowledgeBaseId, projectId, consumeDraft = false, preserveMessages = false) {
      invalidateConversationSelection()
      const result = await createConversation({ initialMessage, knowledgeBaseId, projectId, consumeDraft })
      set((state) => {
        const existing = state.conversations.some((item) => item.id === result.conversation.id)
        return {
          conversations: existing
            ? state.conversations.map((item) => item.id === result.conversation.id ? { ...item, ...result.conversation } : item)
            : [result.conversation, ...state.conversations],
          activeConversationId: result.conversation.id,
          activeProjectId: result.conversation.projectId ?? '',
          messages: preserveMessages ? state.messages : []
        }
      })
      if (!result.existed) useProjectStore.getState().adjustConversationCount(result.conversation.projectId, 1)
      return result
    },

    async selectConversation(conversationId) {
      invalidateConversationSelection()
      const selectionSequence = conversationSelectionSequence
      const controller = new AbortController()
      conversationDetailAbortController = controller
      detachActiveStream()
      const conversation = get().conversations.find((item) => item.id === conversationId)
      set({ activeConversationId: conversationId, activeProjectId: conversation?.projectId ?? '', isLoadingMessages: true })
      const isCurrent = () => selectionSequence === conversationSelectionSequence && get().activeConversationId === conversationId && conversationDetailAbortController === controller

      const kbStore = useKnowledgeBaseStore.getState()
      if (conversation?.knowledgeBaseId) {
        if (kbStore.knowledgeBases.some((kb) => kb.id === conversation.knowledgeBaseId && kb.processingStatus === 'completed')) kbStore.selectKnowledgeBase(conversation.knowledgeBaseId)
        else void kbStore.loadKnowledgeBases(true, true).then(() => {
          const refreshedStore = useKnowledgeBaseStore.getState()
          if (isCurrent() && refreshedStore.knowledgeBases.some((kb) => kb.id === conversation.knowledgeBaseId && kb.processingStatus === 'completed')) {
            refreshedStore.selectKnowledgeBase(conversation.knowledgeBaseId!)
          }
        })
      } else kbStore.clearSelectedKnowledgeBase()

      try {
        const detail = await fetchConversationDetail(conversationId, controller.signal)
        if (!isCurrent()) return false
        set({ messages: detail.messages })
        resumeStreamIfNeeded(conversationId)
        return true
      } catch (error) {
        if (isAbortError(error) || !isCurrent()) return false
        throw error
      } finally {
        if (isCurrent()) {
          conversationDetailAbortController = null
          set({ isLoadingMessages: false })
        }
      }
    },

    async saveConversationKnowledgeBase(knowledgeBaseId) {
      const conversationId = get().activeConversationId
      if (!conversationId) return
      const updated = await updateConversationKnowledgeBase(conversationId, knowledgeBaseId)
      set((state) => ({ conversations: state.conversations.map((item) => item.id === updated.id ? { ...item, ...updated } : item) }))
    },

    async sendMessage(content, fileIds, fileList, knowledgeBaseId, deepThinkingEnabled) {
      if (sendActionInFlight || get().isStopping) {
        return { conversationId: get().activeConversationId, accepted: false }
      }
      requestAssistantNotificationPermission()
      sendActionInFlight = true
      try {
        return await performSendMessage(content, fileIds, fileList, knowledgeBaseId, deepThinkingEnabled)
      } finally {
        sendActionInFlight = false
      }
    },

    async stopStreaming() {
      const conversationId = get().activeStreamingConversationId || get().activeConversationId
      let messageId = get().activeStreamingMessageId || findGeneratingAssistantMessage()?.id
      if (!messageId && activeOptimisticUserMessageId) {
        const optimisticMessageId = activeOptimisticUserMessageId
        activeOptimisticUserMessageId = ''
        set((state) => ({
          messages: state.messages.filter((message) => message.id !== optimisticMessageId)
        }))
        detachActiveStream()
        if (!conversationId || get().isStopping) return
        set({ isStopping: true })
        try {
          for (let attempt = 0; attempt < EARLY_STOP_LOOKUP_ATTEMPTS; attempt += 1) {
            const detail = await fetchConversationDetail(conversationId)
            messageId = [...detail.messages]
              .reverse()
              .find(
                (message) => message.role === 'assistant' && message.status === 'generating'
              )?.id
            if (messageId) break
            await wait(EARLY_STOP_LOOKUP_INTERVAL_MS)
          }
          if (!messageId) {
            setConversationGenerating(conversationId, false)
            await get().loadConversations(true)
            return
          }
          const result = await cancelMessageStream(conversationId, messageId)
          if (get().activeConversationId === conversationId) {
            await get().selectConversation(conversationId)
            upsertMessage(result.assistantMessage)
          }
          await get().loadConversations(true)
        } catch (error) {
          toast.error('停止生成失败，已重新连接当前回答')
          if (get().activeConversationId === conversationId)
            await get().selectConversation(conversationId)
        } finally {
          set({ isStopping: false })
        }
        return
      }
      if (!conversationId || !messageId || get().isStopping) return
      set({ isStopping: true })
      updateMessageState(messageId, (message) => ({ ...message, status: 'cancelled', updatedAt: new Date().toISOString() }))
      detachActiveStream()
      try {
        const result = await cancelMessageStream(conversationId, messageId)
        if (get().activeConversationId === conversationId) upsertMessage(result.assistantMessage)
        await get().loadConversations(true)
      } catch (error) {
        toast.error('停止生成失败，已重新连接当前回答')
        if (get().activeConversationId === conversationId) await get().selectConversation(conversationId)
      } finally {
        set({ isStopping: false })
      }
    },

    detachActiveStream,

    resumeCurrentStream() {
      const conversationId = get().activeConversationId
      if (conversationId) resumeStreamIfNeeded(conversationId)
    },

    async renameConversation(id, title) {
      const updated = await renameConversation(id, title)
      set((state) => ({ conversations: state.conversations.map((item) => item.id === id ? { ...item, ...updated } : item) }))
    },

    async toggleConversationPin(id, isPinned) {
      await toggleConversationPin(id, isPinned)
      await get().loadConversations(true)
    },

    async deleteConversation(id) {
      const deleted = get().conversations.find((item) => item.id === id)
      await deleteConversation(id)
      set((state) => ({ conversations: state.conversations.filter((item) => item.id !== id) }))
      useProjectStore.getState().adjustConversationCount(deleted?.projectId ?? null, -1)
      scheduleConversationStatusPoll()
      if (get().activeConversationId === id) get().startNewConversation()
    },

    async moveConversationToProject(id, projectId) {
      const previous = get().conversations.find((item) => item.id === id)
      const updated = await updateConversationProject(id, projectId)
      set((state) => ({
        conversations: state.conversations.map((item) => item.id === id ? { ...item, ...updated } : item),
        activeProjectId: state.activeConversationId === id ? updated.projectId ?? '' : state.activeProjectId
      }))
      useProjectStore.getState().adjustConversationCount(previous?.projectId ?? null, -1)
      useProjectStore.getState().adjustConversationCount(updated.projectId, 1)
      return updated
    },

    async updateMessage(messageId, content) {
      const conversationId = get().activeConversationId
      const editedIndex = get().messages.findIndex((message) => message.id === messageId)
      if (!conversationId || editedIndex < 0) return
      requestAssistantNotificationPermission()
      const deepThinkingEnabled = getRegenerationDeepThinkingEnabled(get().messages, messageId)
      const updated = await updateMessageApi(conversationId, messageId, content)
      set((state) => ({ messages: [...state.messages.slice(0, editedIndex), updated] }))
      detachActiveStream()
      const controller = new AbortController()
      startActiveStream(conversationId, controller)
      setConversationGenerating(conversationId, true, true)
      set({ streamingStatus: { stage: 'thinking', text: '正在根据编辑内容重新生成...' }, streamingStatusText: '正在根据编辑内容重新生成...' })
      try {
        await regenerateMessage(conversationId, messageId, { deepThinkingEnabled, timeZone: getBrowserTimeZone() }, buildStreamHandlers(conversationId, controller), controller.signal)
      } catch (error) {
        if (!isAbortError(error)) {
          const failedId = get().activeStreamingMessageId
          if (failedId) updateMessageState(failedId, (message) => message.status === 'generating' ? { ...message, status: 'failed' } : message)
          console.error('Regenerate message error:', error)
          await get().loadConversations(true)
        }
      } finally {
        if (activeStreamAbortController === controller) clearActiveStream()
      }
    },

    async deleteMessage(messageId) {
      const conversationId = get().activeConversationId
      if (!conversationId) return
      await deleteMessageApi(conversationId, messageId)
      set((state) => ({ messages: state.messages.filter((message) => message.id !== messageId) }))
    },

    resetChatState() {
      optimisticGeneratingConversations.clear()
      invalidateConversationSelection()
      detachActiveStream()
      activeOptimisticUserMessageId = ''
      clearConversationStatusPoll()
      conversationsRequestSequence += 1
      set({ conversations: [], activeConversationId: '', activeProjectId: '', messages: [], isLoadingConversations: false, isLoadingMessages: false, isStopping: false })
    }
  }
})
