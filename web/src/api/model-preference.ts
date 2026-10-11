import type { ApiResponse } from '../types/api'
import type { ModelInfo, UpdateModelPreferenceInput } from '../types/chat'
import { http } from './http'

export async function fetchAvailableModels(): Promise<ModelInfo[]> {
  const response = await http.get<ApiResponse<ModelInfo[]>>('/model-preferences/available')
  return response.data.data
}

export async function fetchPreferredModel(): Promise<ModelInfo> {
  const response = await http.get<ApiResponse<ModelInfo>>('/model-preferences/preferred')
  return response.data.data
}

export async function updatePreferredModel(
  input: UpdateModelPreferenceInput
): Promise<ModelInfo> {
  const response = await http.put<ApiResponse<{ preferredModel: ModelInfo }>>(
    '/model-preferences/preferred',
    input
  )
  return response.data.data.preferredModel
}
