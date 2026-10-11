import type { ApiResponse } from '../types/api'
import type { UploadedFile } from './file'
import { http } from './http'

export type ConversationDraftRecord = {
  id: string
  knowledgeBaseId: string | null
  file: UploadedFile | null
  createdAt: string
  updatedAt: string
}

export async function fetchConversationDraft(): Promise<ConversationDraftRecord> {
  const response = await http.get<ApiResponse<ConversationDraftRecord>>('/conversation-draft')
  return response.data.data
}

export async function updateConversationDraftKnowledgeBase(
  knowledgeBaseId: string | null
): Promise<ConversationDraftRecord> {
  const response = await http.patch<ApiResponse<ConversationDraftRecord>>(
    '/conversation-draft/knowledge-base',
    { knowledgeBaseId }
  )
  return response.data.data
}
