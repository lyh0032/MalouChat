import type { ApiResponse } from '../types/api'
import type { AiModelInput, AiModelRecord } from '../types/admin-model'
import { http } from './http'

export async function fetchAdminModels(): Promise<AiModelRecord[]> {
  const response = await http.get<ApiResponse<{ models: AiModelRecord[] }>>('/admin/models')
  return response.data.data.models
}

export async function createAdminModel(input: AiModelInput): Promise<AiModelRecord> {
  const response = await http.post<ApiResponse<AiModelRecord>>('/admin/models', input)
  return response.data.data
}

export async function updateAdminModel(
  modelId: string,
  input: AiModelInput
): Promise<AiModelRecord> {
  const response = await http.put<ApiResponse<AiModelRecord>>(`/admin/models/${modelId}`, input)
  return response.data.data
}

export async function deleteAdminModel(modelId: string): Promise<void> {
  await http.delete(`/admin/models/${modelId}`)
}

export async function applyChatModelToAllUsers(modelId: string): Promise<{
  modelId: string
  modelCode: string
  displayName: string
  updatedUserCount: number
}> {
  const response = await http.post<
    ApiResponse<{
      modelId: string
      modelCode: string
      displayName: string
      updatedUserCount: number
    }>
  >('/admin/models/chat/apply-to-all', { modelId })
  return response.data.data
}

export async function reorderAdminChatModels(modelIds: string[]): Promise<AiModelRecord[]> {
  const response = await http.put<ApiResponse<{ models: AiModelRecord[] }>>(
    '/admin/models/chat/order',
    { modelIds }
  )
  return response.data.data.models
}
