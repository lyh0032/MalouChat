export type MemoryType = 'profile' | 'preference' | 'summary' | 'fact'

export type MemoryRecord = {
  id: string
  userId: string
  type: MemoryType
  key: string
  content: string
  createdAt: string
  updatedAt: string
}

export type MemoryFilters = {
  type?: MemoryType
  search?: string
}

export type CreateMemoryInput = {
  type: MemoryType
  key: string
  content: string
}

export type UpdateMemoryInput = Partial<CreateMemoryInput>
