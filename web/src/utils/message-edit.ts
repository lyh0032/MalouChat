import type { Message } from '../types/chat'

type MessageEditRecord = Pick<
  Message,
  'id' | 'role' | 'status' | 'deepThinkingEnabled'
>

export function canEditLastUserMessage(
  messages: MessageEditRecord[],
  message: MessageEditRecord,
  editingLocked: boolean
) {
  if (editingLocked || message.role !== 'user' || message.status !== 'completed') {
    return false
  }

  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user')
  return lastUserMessage?.id === message.id
}

export function getRegenerationDeepThinkingEnabled(
  messages: MessageEditRecord[],
  messageId: string
) {
  const messageIndex = messages.findIndex((message) => message.id === messageId)
  if (messageIndex < 0) return false

  const assistantResponse = messages
    .slice(messageIndex + 1)
    .find((message) => message.role === 'assistant')

  return assistantResponse?.deepThinkingEnabled === true
}
