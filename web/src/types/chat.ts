export type ConversationSummary = {
  id: string
  title: string
  isPinned: boolean
  projectId: string | null
  knowledgeBaseId: string | null
  createdAt: string
  updatedAt: string
  lastMessagePreview: string
  messageCount: number
  isGenerating: boolean
}

export type MessageFile = {
  id?: string
  name: string
  storageKey: string
  kind: 'image' | 'file'
  size?: number
}

export type CreateMessageInput = {
  content: string
  fileIds?: string[]
  knowledgeBaseId?: string
  deepThinkingEnabled?: boolean
  timeZone?: string
}

export type Message = {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  fileList: MessageFile[]
  status: 'generating' | 'completed' | 'cancelled' | 'failed'
  type?: 'text' | 'image'
  deepThinkingEnabled?: boolean
  reasoningContent?: string
  reasoningStatus?: 'thinking' | 'done'
  createdAt: string
  updatedAt: string
}

export type ConversationDetail = {
  id: string
  title: string
  userId: string
  projectId: string | null
  knowledgeBaseId: string | null
  createdAt: string
  updatedAt: string
  messages: Message[]
}

export type CreateConversationInput = {
  title?: string
  initialMessage?: string
  projectId?: string | null
  knowledgeBaseId?: string | null
  consumeDraft?: boolean
}

export type CreateConversationResponse = {
  conversation: ConversationSummary
  existed: boolean
}

export type StreamAssistantStatus = {
  stage: 'thinking' | 'tool' | 'reasoning'
  text: string
  toolName?: string
}

export type ModelInfo = {
  id: string
  name: string
  description: string
}

export type UpdateModelPreferenceInput = {
  modelId: string
}
