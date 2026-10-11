type ConversationHistoryRecord = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
}

export function buildConversationHistoryBeforeMessage(
  history: ConversationHistoryRecord[],
  messageId: string
) {
  const targetIndex = history.findIndex((message) => message.id === messageId)
  const messagesBeforeTarget = targetIndex >= 0 ? history.slice(0, targetIndex) : history

  return messagesBeforeTarget.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  }))
}
