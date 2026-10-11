import type { ApiResponse } from '../types/api'
import type {
  CreateMemoryInput,
  MemoryFilters,
  MemoryRecord,
  UpdateMemoryInput
} from '../types/memory'
import { http } from './http'

export async function fetchMemories(filters: MemoryFilters = {}): Promise<MemoryRecord[]> {
  const response = await http.get<ApiResponse<{ memories: MemoryRecord[] }>>('/memories', {
    params: filters
  })
  return response.data.data.memories
}

export async function createMemory(input: CreateMemoryInput): Promise<MemoryRecord> {
  const response = await http.post<ApiResponse<MemoryRecord>>('/memories', input)
  return response.data.data
}

export async function updateMemory(
  memoryId: string,
  input: UpdateMemoryInput
): Promise<MemoryRecord> {
  const response = await http.patch<ApiResponse<MemoryRecord>>(`/memories/${memoryId}`, input)
  return response.data.data
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await http.delete(`/memories/${memoryId}`)
}
