import { localizeErrorMessage } from '../i18n/errors'
import { t } from '../i18n'
import type { ApiErrorResponse, ApiResponse } from '../types/api'
import type {
  CreateConversationInput,
  CreateConversationResponse,
  CreateMessageInput,
  ConversationDetail,
  ConversationSummary,
  Message,
  StreamAssistantStatus
} from '../types/chat'
import { ensureFetchResponseOk, fetchWithAuth, http } from './http'
import { consumeSseStream, type SseEvent } from './sse'
import type { ClientToolRequest } from '../utils/client-tools'

type StreamMessageHandlers = {
  onUserMessage?: (message: Message) => void
  onAssistantMessage?: (message: Message) => void
  onAssistantStatus?: (status: StreamAssistantStatus) => void
  onAssistantReasoningStart?: (payload: { messageId: string }) => void
  onAssistantReasoningDelta?: (payload: { messageId: string; delta: string }) => void
  onAssistantReasoningDone?: (payload: { messageId: string; content: string }) => void
  onAssistantDelta?: (delta: string) => void
  onAssistantDone?: (payload: { assistantMessage: Message; conversationId: string }) => void
  onAssistantCancelled?: (payload: { assistantMessage: Message; conversationId: string }) => void
  onAssistantFailed?: (payload: {
    assistantMessage: Message
    conversationId: string
    message: string
  }) => void
  onClientToolRequest?: (payload: ClientToolRequest) => void
}

type StreamState = {
  latestConversationId: string
  latestAssistantMessageId: string
  terminalEventReceived: boolean
}

type StreamTerminalPayload = {
  assistantMessage: Message
  conversationId: string
}

type StreamFailedPayload = StreamTerminalPayload & {
  message: string
}

function invalidStreamPayload(event: string, field?: string): Error {
  const detail = field ? t('ui.missingOrInvalidFieldValue', { v0: field }) : ''
  return new Error(t('ui.invalidDataForStreamEventValueValue', { v0: event, v1: detail }))
}

function expectRecord(value: unknown, event: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidStreamPayload(event)
  }

  return value as Record<string, unknown>
}

function expectString(record: Record<string, unknown>, field: string, event: string): string {
  const value = record[field]
  if (typeof value !== 'string') {
    throw invalidStreamPayload(event, field)
  }

  return value
}

function parseMessagePayload(value: unknown, event: string): Message {
  const message = expectRecord(value, event)
  const role = expectString(message, 'role', event)
  const status = expectString(message, 'status', event)

  expectString(message, 'id', event)
  expectString(message, 'conversationId', event)
  expectString(message, 'content', event)
  expectString(message, 'createdAt', event)
  expectString(message, 'updatedAt', event)

  if (!['user', 'assistant', 'system'].includes(role)) {
    throw invalidStreamPayload(event, 'role')
  }

  if (!['generating', 'completed', 'cancelled', 'failed'].includes(status)) {
    throw invalidStreamPayload(event, 'status')
  }

  if (!Array.isArray(message.fileList)) {
    throw invalidStreamPayload(event, 'fileList')
  }

  return message as unknown as Message
}

function parseStatusPayload(value: unknown, event: string): StreamAssistantStatus {
  const status = expectRecord(value, event)
  const stage = expectString(status, 'stage', event)

  if (!['thinking', 'tool', 'reasoning'].includes(stage)) {
    throw invalidStreamPayload(event, 'stage')
  }

  expectString(status, 'text', event)

  if (status.toolName !== undefined && typeof status.toolName !== 'string') {
    throw invalidStreamPayload(event, 'toolName')
  }

  return status as unknown as StreamAssistantStatus
}

function parseTerminalPayload(value: unknown, event: string): StreamTerminalPayload {
  const payload = expectRecord(value, event)

  return {
    assistantMessage: parseMessagePayload(payload.assistantMessage, event),
    conversationId: expectString(payload, 'conversationId', event)
  }
}

function parseClientToolRequest(value: unknown, event: string): ClientToolRequest {
  const request = expectRecord(value, event)

  return {
    requestId: expectString(request, 'requestId', event),
    conversationId: expectString(request, 'conversationId', event),
    messageId: expectString(request, 'messageId', event),
    toolName: expectString(request, 'toolName', event),
    params: request.params
  }
}

function ensureTerminalEventReceived(state: StreamState, fallbackMessage: string) {
  if (!state.terminalEventReceived) {
    throw new Error(
      t('ui.valueConnectionClosedBeforeTheFinalMessageStatusArrived', { v0: fallbackMessage })
    )
  }
}

function applyStreamEvent(
  parsed: SseEvent,
  handlers: StreamMessageHandlers,
  state: StreamState,
  fallbackMessage: string
) {
  if (parsed.event === 'user-message' && parsed.data) {
    handlers.onUserMessage?.(parseMessagePayload(parsed.data, parsed.event))
    return
  }

  if (parsed.event === 'assistant-message' && parsed.data) {
    const assistantMessage = parseMessagePayload(parsed.data, parsed.event)
    state.latestAssistantMessageId = assistantMessage.id
    handlers.onAssistantMessage?.(assistantMessage)
    return
  }

  if (parsed.event === 'assistant-status' && parsed.data) {
    handlers.onAssistantStatus?.(parseStatusPayload(parsed.data, parsed.event))
    return
  }

  if (parsed.event === 'assistant-reasoning-start' && parsed.data) {
    const payload = expectRecord(parsed.data, parsed.event)
    handlers.onAssistantReasoningStart?.({
      messageId: expectString(payload, 'messageId', parsed.event)
    })
    return
  }

  if (parsed.event === 'assistant-reasoning-delta' && parsed.data) {
    const payload = expectRecord(parsed.data, parsed.event)
    handlers.onAssistantReasoningDelta?.({
      messageId: expectString(payload, 'messageId', parsed.event),
      delta: expectString(payload, 'delta', parsed.event)
    })
    return
  }

  if (parsed.event === 'assistant-reasoning-done' && parsed.data) {
    const payload = expectRecord(parsed.data, parsed.event)
    handlers.onAssistantReasoningDone?.({
      messageId: expectString(payload, 'messageId', parsed.event),
      content: expectString(payload, 'content', parsed.event)
    })
    return
  }

  if (parsed.event === 'assistant-delta' && parsed.data) {
    const payload = expectRecord(parsed.data, parsed.event)
    handlers.onAssistantDelta?.(expectString(payload, 'delta', parsed.event))
    return
  }

  if (parsed.event === 'assistant-done' && parsed.data) {
    const payload = parseTerminalPayload(parsed.data, parsed.event)
    state.terminalEventReceived = true
    state.latestConversationId = payload.conversationId
    state.latestAssistantMessageId = payload.assistantMessage.id
    handlers.onAssistantDone?.(payload)
    return
  }

  if (parsed.event === 'assistant-cancelled' && parsed.data) {
    const payload = parseTerminalPayload(parsed.data, parsed.event)
    state.terminalEventReceived = true
    state.latestConversationId = payload.conversationId
    state.latestAssistantMessageId = payload.assistantMessage.id
    handlers.onAssistantCancelled?.(payload)
    return
  }

  if (parsed.event === 'assistant-failed' && parsed.data) {
    const terminalPayload = parseTerminalPayload(parsed.data, parsed.event)
    const payloadRecord = expectRecord(parsed.data, parsed.event)
    const payload: StreamFailedPayload = {
      ...terminalPayload,
      message: localizeErrorMessage(expectString(payloadRecord, 'message', parsed.event))
    }
    state.terminalEventReceived = true
    state.latestConversationId = payload.conversationId
    state.latestAssistantMessageId = payload.assistantMessage.id
    handlers.onAssistantFailed?.(payload)
    return
  }

  if (parsed.event === 'client-tool-request' && parsed.data) {
    handlers.onClientToolRequest?.(parseClientToolRequest(parsed.data, parsed.event))
    return
  }

  if (parsed.event === 'error' && parsed.data) {
    const payload = expectRecord(parsed.data, parsed.event)
    const message = typeof payload.message === 'string' ? payload.message : fallbackMessage
    const errorCode = typeof payload.errorCode === 'string' ? payload.errorCode : undefined
    const error = new Error(localizeErrorMessage(message, errorCode)) as Error & {
      payload: ApiErrorResponse
    }
    error.payload = {
      success: false,
      message,
      errorCode
    }
    throw error
  }
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const response =
    await http.get<ApiResponse<{ conversations: ConversationSummary[] }>>('/conversations')
  return response.data.data.conversations
}

export async function createConversation(
  input: CreateConversationInput
): Promise<CreateConversationResponse> {
  const response = await http.post<ApiResponse<CreateConversationResponse>>('/conversations', input)
  return response.data.data
}

export async function fetchConversationDetail(
  conversationId: string,
  signal?: AbortSignal
): Promise<ConversationDetail> {
  const response = await http.get<ApiResponse<ConversationDetail>>(
    `/conversations/${conversationId}`,
    { signal }
  )
  return response.data.data
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<ConversationSummary> {
  const response = await http.patch<ApiResponse<ConversationSummary>>(
    `/conversations/${conversationId}`,
    {
      title
    }
  )
  return response.data.data
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await http.delete(`/conversations/${conversationId}`)
}

export async function updateConversationKnowledgeBase(
  conversationId: string,
  knowledgeBaseId: string | null
): Promise<ConversationSummary> {
  const response = await http.patch<ApiResponse<ConversationSummary>>(
    `/conversations/${conversationId}/knowledge-base`,
    { knowledgeBaseId }
  )
  return response.data.data
}

export async function updateConversationProject(
  conversationId: string,
  projectId: string | null
): Promise<ConversationSummary> {
  const response = await http.patch<ApiResponse<ConversationSummary>>(
    `/conversations/${conversationId}/project`,
    { projectId }
  )
  return response.data.data
}

export async function toggleConversationPin(
  conversationId: string,
  isPinned: boolean
): Promise<ConversationSummary> {
  const response = await http.patch<ApiResponse<ConversationSummary>>(
    `/conversations/${conversationId}/pin`,
    {
      isPinned
    }
  )
  return response.data.data
}

export async function streamMessage(
  conversationId: string,
  input: CreateMessageInput,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
): Promise<{ conversationId: string; assistantMessageId?: string }> {
  const state: StreamState = {
    latestConversationId: conversationId,
    latestAssistantMessageId: '',
    terminalEventReceived: false
  }

  const response = await fetchWithAuth(`/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(input),
    signal
  })

  await ensureFetchResponseOk(response, t('ui.streamingRequestFailed'))

  await consumeSseStream(response, (parsed) => {
    applyStreamEvent(parsed, handlers, state, t('ui.streamingRequestFailed'))
  })
  ensureTerminalEventReceived(state, t('ui.streamingRequestFailed'))

  return {
    conversationId: state.latestConversationId,
    assistantMessageId: state.latestAssistantMessageId || undefined
  }
}

export async function subscribeMessageStream(
  conversationId: string,
  messageId: string,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
): Promise<{ conversationId: string; assistantMessageId?: string }> {
  const state: StreamState = {
    latestConversationId: conversationId,
    latestAssistantMessageId: messageId,
    terminalEventReceived: false
  }

  const response = await fetchWithAuth(
    `/conversations/${conversationId}/messages/${messageId}/stream`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream'
      },
      signal
    }
  )

  await ensureFetchResponseOk(response, t('ui.failedToResumeTheResponse'))

  await consumeSseStream(response, (parsed) => {
    applyStreamEvent(parsed, handlers, state, t('ui.failedToResumeTheResponse'))
  })
  ensureTerminalEventReceived(state, t('ui.failedToResumeTheResponse'))

  return {
    conversationId: state.latestConversationId,
    assistantMessageId: state.latestAssistantMessageId || undefined
  }
}

export async function regenerateMessage(
  conversationId: string,
  messageId: string,
  input: { deepThinkingEnabled: boolean; timeZone?: string },
  handlers: StreamMessageHandlers,
  signal?: AbortSignal
): Promise<{ conversationId: string; assistantMessageId?: string }> {
  const state: StreamState = {
    latestConversationId: conversationId,
    latestAssistantMessageId: '',
    terminalEventReceived: false
  }

  const response = await fetchWithAuth(
    `/conversations/${conversationId}/messages/${messageId}/regenerate`,
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input),
      signal
    }
  )

  await ensureFetchResponseOk(response, t('ui.failedToRegenerateTheResponse'))

  await consumeSseStream(response, (parsed) => {
    applyStreamEvent(parsed, handlers, state, t('ui.failedToRegenerateTheResponse'))
  })
  ensureTerminalEventReceived(state, t('ui.failedToRegenerateTheResponse'))

  return {
    conversationId: state.latestConversationId,
    assistantMessageId: state.latestAssistantMessageId || undefined
  }
}

export async function cancelMessageStream(conversationId: string, messageId: string) {
  const response = await http.post<
    ApiResponse<{ assistantMessage: Message; conversationId: string }>
  >(`/conversations/${conversationId}/messages/${messageId}/cancel`)

  return response.data.data
}

export async function submitClientToolResult(
  conversationId: string,
  messageId: string,
  input: {
    requestId: string
    success: boolean
    result?: unknown
    error?: string
  }
) {
  const response = await fetchWithAuth(
    `/conversations/${conversationId}/messages/${messageId}/client-tool-result`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    }
  )
  await ensureFetchResponseOk(response, t('ui.failedToSubmitTheClientToolResult'))
}

export async function updateMessage(
  conversationId: string,
  messageId: string,
  content: string
): Promise<Message> {
  const response = await http.patch<ApiResponse<Message>>(
    `/conversations/${conversationId}/messages/${messageId}`,
    { content }
  )
  return response.data.data
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await http.delete(`/conversations/${conversationId}/messages/${messageId}`)
}
