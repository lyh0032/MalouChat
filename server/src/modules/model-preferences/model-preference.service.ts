import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import {
  getDefaultModelConfig,
  getSelectableChatModel,
  getSelectableChatModels,
  type RuntimeModelConfig
} from '../../lib/model-registry'
import type { UpdateModelPreferenceBody } from './model-preference.schema'

type ModelPreferenceInfo = {
  id: string
  name: string
  description: string
}

export async function getAvailableModels(): Promise<ModelPreferenceInfo[]> {
  const models = await getSelectableChatModels()
  return models.map(formatModelPreference)
}

function formatModelPreference(model: RuntimeModelConfig): ModelPreferenceInfo {
  return {
    id: model.code,
    name: model.displayName,
    description: model.description
  }
}

export async function getUserPreferredModel(userId: string): Promise<ModelPreferenceInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredModel: true }
  })

  if (!user) {
    throw new AppError(404, '用户不存在', 'USER_NOT_FOUND')
  }

  if (user.preferredModel) {
    const model = await getSelectableChatModel(user.preferredModel)
    if (model) {
      return formatModelPreference(model)
    }
  }

  return formatModelPreference(await getDefaultModelConfig('chat'))
}

export async function updateModelPreference(userId: string, data: UpdateModelPreferenceBody) {
  const model = await getSelectableChatModel(data.modelId)

  if (!model) {
    throw new AppError(400, '不支持的模型', 'MODEL_NOT_SUPPORTED')
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { preferredModel: data.modelId }
  })

  return {
    preferredModel: formatModelPreference(model)
  }
}

export async function getModelNameForLLM(userId: string): Promise<string> {
  const preferredModel = await getUserPreferredModel(userId)
  return preferredModel.id
}
