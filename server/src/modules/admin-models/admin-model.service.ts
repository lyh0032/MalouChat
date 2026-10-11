import { Prisma, type AiModel } from '@prisma/client'

import { invalidateModelRegistryCache } from '../../lib/model-registry'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import type {
  AiModelTypeInput,
  CreateAiModelBody,
  ImageSettingsBody,
  UpdateAiModelBody
} from './admin-model.schema'

type NormalizedModelInput = {
  code: string
  displayName: string
  description: string
  provider: string
  type: AiModelTypeInput
  isEnabled: boolean
  isUserSelectable: boolean
  isDefault: boolean
  sortOrder: number
  dimensions: number | null
  settings: ImageSettingsBody | null
}

const defaultImageSettings: ImageSettingsBody = {
  size: '1024*1024',
  promptExtend: true,
  watermark: false
}

function normalizeModelInput(
  input: CreateAiModelBody | UpdateAiModelBody,
  current?: AiModel
): NormalizedModelInput {
  const type = input.type ?? current?.type

  if (!type) {
    throw new AppError(400, '模型类型不能为空', 'MODEL_TYPE_REQUIRED')
  }

  const isEnabled = input.isEnabled ?? current?.isEnabled ?? true
  const isDefault = input.isDefault ?? current?.isDefault ?? false
  const isUserSelectable =
    type === 'chat' ? input.isUserSelectable ?? current?.isUserSelectable ?? false : false
  const dimensions = type === 'embedding'
    ? input.dimensions ?? current?.dimensions ?? 1024
    : null
  const currentSettings =
    current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
      ? current.settings as ImageSettingsBody
      : null
  const settings = type === 'image'
    ? input.settings ?? currentSettings ?? defaultImageSettings
    : null

  const normalized: NormalizedModelInput = {
    code: input.code ?? current?.code ?? '',
    displayName: input.displayName ?? current?.displayName ?? '',
    description: input.description ?? current?.description ?? '',
    provider: input.provider ?? current?.provider ?? 'dashscope',
    type,
    isEnabled,
    isUserSelectable,
    isDefault,
    sortOrder: input.sortOrder ?? current?.sortOrder ?? 0,
    dimensions,
    settings
  }

  if (!normalized.code || !normalized.displayName) {
    throw new AppError(400, '模型标识和显示名称不能为空', 'MODEL_FIELDS_REQUIRED')
  }

  if (isDefault && !isEnabled) {
    throw new AppError(400, '默认模型必须处于启用状态', 'DEFAULT_MODEL_DISABLED')
  }

  if (type === 'chat' && isDefault && !isUserSelectable) {
    throw new AppError(400, '默认对话模型必须允许用户选择', 'DEFAULT_CHAT_NOT_SELECTABLE')
  }

  if (type === 'embedding' && dimensions !== 1024) {
    throw new AppError(
      400,
      '当前向量索引固定为 1024 维，只能使用输出 1024 维向量的模型',
      'EMBEDDING_DIMENSIONS_UNSUPPORTED'
    )
  }

  return normalized
}

function toPrismaData(input: NormalizedModelInput) {
  return {
    ...input,
    settings: input.settings ?? Prisma.DbNull
  }
}

function translatePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError(409, '同一能力类型下已存在相同的模型标识', 'MODEL_CODE_TAKEN')
  }

  throw error
}

export async function listAiModels() {
  return prisma.aiModel.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
  })
}

export async function createAiModel(input: CreateAiModelBody) {
  const data = normalizeModelInput(input)

  try {
    const model = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.aiModel.updateMany({
          where: { type: data.type, isDefault: true },
          data: { isDefault: false }
        })
      }

      return tx.aiModel.create({ data: toPrismaData(data) })
    })

    invalidateModelRegistryCache()
    return model
  } catch (error) {
    return translatePrismaError(error)
  }
}

export async function updateAiModel(modelId: string, input: UpdateAiModelBody) {
  const current = await prisma.aiModel.findUnique({ where: { id: modelId } })

  if (!current) {
    throw new AppError(404, '模型配置不存在', 'MODEL_NOT_FOUND')
  }

  const data = normalizeModelInput(input, current)

  if (current.isDefault && !data.isDefault) {
    throw new AppError(400, '请先将同类型的另一个模型设为默认模型', 'DEFAULT_MODEL_REQUIRED')
  }

  if (current.isDefault && current.type !== data.type) {
    throw new AppError(400, '默认模型不能直接更改能力类型', 'DEFAULT_MODEL_TYPE_LOCKED')
  }

  try {
    const model = await prisma.$transaction(async (tx) => {
      if (data.isDefault && (!current.isDefault || current.type !== data.type)) {
        await tx.aiModel.updateMany({
          where: {
            type: data.type,
            isDefault: true,
            id: { not: modelId }
          },
          data: { isDefault: false }
        })
      }

      if (current.type === 'chat' && (data.type !== 'chat' || current.code !== data.code)) {
        await tx.user.updateMany({
          where: { preferredModel: current.code },
          data: { preferredModel: data.type === 'chat' ? data.code : null }
        })
      }

      return tx.aiModel.update({
        where: { id: modelId },
        data: toPrismaData(data)
      })
    })

    invalidateModelRegistryCache()
    return model
  } catch (error) {
    return translatePrismaError(error)
  }
}

export async function deleteAiModel(modelId: string) {
  const current = await prisma.aiModel.findUnique({ where: { id: modelId } })

  if (!current) {
    throw new AppError(404, '模型配置不存在', 'MODEL_NOT_FOUND')
  }

  if (current.isDefault) {
    throw new AppError(400, '默认模型不能删除，请先设置另一个默认模型', 'DEFAULT_MODEL_DELETE_BLOCKED')
  }

  await prisma.$transaction(async (tx) => {
    if (current.type === 'chat') {
      await tx.user.updateMany({
        where: { preferredModel: current.code },
        data: { preferredModel: null }
      })
    }

    await tx.aiModel.delete({ where: { id: modelId } })
  })

  invalidateModelRegistryCache()
}

export async function applyChatModelToAllUsers(modelId: string) {
  const model = await prisma.aiModel.findFirst({
    where: {
      id: modelId,
      type: 'chat',
      isEnabled: true,
      isUserSelectable: true
    },
    select: {
      code: true,
      displayName: true
    }
  })

  if (!model) {
    throw new AppError(400, '目标模型不是当前可选的对话模型', 'CHAT_MODEL_NOT_SELECTABLE')
  }

  const result = await prisma.user.updateMany({
    data: { preferredModel: model.code }
  })

  return {
    modelId,
    modelCode: model.code,
    displayName: model.displayName,
    updatedUserCount: result.count
  }
}

export async function reorderChatModels(modelIds: string[]) {
  const chatModels = await prisma.aiModel.findMany({
    where: { type: 'chat' },
    select: { id: true }
  })
  const existingIds = new Set(chatModels.map((model) => model.id))

  if (
    modelIds.length !== chatModels.length
    || modelIds.some((modelId) => !existingIds.has(modelId))
  ) {
    throw new AppError(
      409,
      '对话模型列表已发生变化，请刷新页面后重新排序',
      'CHAT_MODEL_ORDER_STALE'
    )
  }

  await prisma.$transaction(
    modelIds.map((modelId, index) =>
      prisma.aiModel.update({
        where: { id: modelId },
        data: { sortOrder: (index + 1) * 10 }
      })
    )
  )

  invalidateModelRegistryCache()

  return prisma.aiModel.findMany({
    where: { type: 'chat' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  })
}
