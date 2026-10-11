export type AiModelType = 'chat' | 'embedding' | 'vision' | 'speech' | 'image'

export type ImageModelSettings = {
  size: string
  promptExtend: boolean
  watermark: boolean
}

export type AiModelRecord = {
  id: string
  code: string
  displayName: string
  description: string
  provider: string
  type: AiModelType
  isEnabled: boolean
  isUserSelectable: boolean
  isDefault: boolean
  sortOrder: number
  dimensions: number | null
  settings: ImageModelSettings | null
  createdAt: string
  updatedAt: string
}

export type AiModelInput = {
  code: string
  displayName: string
  description: string
  provider: string
  type: AiModelType
  isEnabled: boolean
  isUserSelectable: boolean
  isDefault: boolean
  sortOrder: number
  dimensions: number | null
  settings: ImageModelSettings | null
}
