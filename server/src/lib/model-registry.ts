import type { AiModel, AiModelType, Prisma } from '@prisma/client'

import { prisma } from './prisma'

export type ModelType = AiModelType

export type ImageModelSettings = {
  size: string
  promptExtend: boolean
  watermark: boolean
}

export type RuntimeModelConfig = Omit<AiModel, 'settings'> & {
  settings: Prisma.JsonValue | null
}

const CACHE_TTL_MS = 15_000
const DEFAULT_IMAGE_SETTINGS: ImageModelSettings = {
  size: '1024*1024',
  promptExtend: true,
  watermark: false
}

const fallbackModels: RuntimeModelConfig[] = [
  {
    id: 'fallback-chat-qwen-3-7-plus',
    code: 'qwen3.7-plus',
    displayName: 'Qwen 3.7 Plus',
    description: '阿里巴巴-qwen3.7-plus',
    provider: 'dashscope',
    type: 'chat',
    isEnabled: true,
    isUserSelectable: true,
    isDefault: true,
    sortOrder: 10,
    dimensions: null,
    settings: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  },
  {
    id: 'fallback-embedding-text-v3',
    code: 'text-embedding-v3',
    displayName: 'Text Embedding V3',
    description: '文件与知识库向量检索模型（1024 维）',
    provider: 'dashscope',
    type: 'embedding',
    isEnabled: true,
    isUserSelectable: false,
    isDefault: true,
    sortOrder: 10,
    dimensions: 1024,
    settings: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  },
  {
    id: 'fallback-vision-qwen-3-7-plus',
    code: 'qwen3.7-plus',
    displayName: 'Qwen 3.7 Plus Vision',
    description: '图片内容理解与文字识别模型',
    provider: 'dashscope',
    type: 'vision',
    isEnabled: true,
    isUserSelectable: false,
    isDefault: true,
    sortOrder: 10,
    dimensions: null,
    settings: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  },
  {
    id: 'fallback-speech-qwen-3-asr-flash',
    code: 'qwen3-asr-flash',
    displayName: 'Qwen 3 ASR Flash',
    description: '语音转文字模型',
    provider: 'dashscope',
    type: 'speech',
    isEnabled: true,
    isUserSelectable: false,
    isDefault: true,
    sortOrder: 10,
    dimensions: null,
    settings: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  },
  {
    id: 'fallback-image-qwen-image-2-pro',
    code: 'qwen-image-2.0-pro',
    displayName: 'Qwen Image 2.0 Pro',
    description: '文本生成图片模型',
    provider: 'dashscope',
    type: 'image',
    isEnabled: true,
    isUserSelectable: false,
    isDefault: true,
    sortOrder: 10,
    dimensions: null,
    settings: DEFAULT_IMAGE_SETTINGS,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }
]

let cachedModels: RuntimeModelConfig[] | null = null
let cacheExpiresAt = 0

export function invalidateModelRegistryCache() {
  cachedModels = null
  cacheExpiresAt = 0
}

async function loadModels(): Promise<RuntimeModelConfig[]> {
  if (cachedModels && cacheExpiresAt > Date.now()) {
    return cachedModels
  }

  try {
    const models = await prisma.aiModel.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
    })

    cachedModels = models
    cacheExpiresAt = Date.now() + CACHE_TTL_MS
    return models
  } catch (error) {
    console.error('[model-registry] 读取数据库模型配置失败，使用内置回退配置:', error)
    return fallbackModels
  }
}

function getFallbackByType(type: ModelType) {
  return fallbackModels.filter((model) => model.type === type)
}

export async function getModelsByType(type: ModelType): Promise<RuntimeModelConfig[]> {
  const allModels = await loadModels()
  const models = allModels.filter((model) => model.type === type)
  return models.length > 0 ? models : getFallbackByType(type)
}

export async function getDefaultModelConfig(type: ModelType): Promise<RuntimeModelConfig> {
  const models = await getModelsByType(type)
  const model = models.find((item) => item.isEnabled && item.isDefault)
    ?? models.find((item) => item.isEnabled)
    ?? getFallbackByType(type)[0]

  if (!model) {
    throw new Error(`未配置 ${type} 类型的可用模型`)
  }

  return model
}

export async function getSelectableChatModels(): Promise<RuntimeModelConfig[]> {
  const models = await getModelsByType('chat')
  return models.filter((model) => model.isEnabled && model.isUserSelectable)
}

export async function getSelectableChatModel(code: string): Promise<RuntimeModelConfig | undefined> {
  const models = await getSelectableChatModels()
  return models.find((model) => model.code === code)
}

export function getImageModelSettings(model: RuntimeModelConfig): ImageModelSettings {
  const settings =
    model.settings && typeof model.settings === 'object' && !Array.isArray(model.settings)
      ? model.settings as Record<string, unknown>
      : {}
  const size = typeof settings.size === 'string' && /^\d+\*\d+$/.test(settings.size)
    ? settings.size
    : DEFAULT_IMAGE_SETTINGS.size

  return {
    size,
    promptExtend:
      typeof settings.promptExtend === 'boolean'
        ? settings.promptExtend
        : DEFAULT_IMAGE_SETTINGS.promptExtend,
    watermark:
      typeof settings.watermark === 'boolean'
        ? settings.watermark
        : DEFAULT_IMAGE_SETTINGS.watermark
  }
}
