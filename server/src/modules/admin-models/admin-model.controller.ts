import type { Request, Response } from 'express'

import { sendDeleted, sendSuccess } from '../../utils/http'
import {
  applyChatModelToAllUsers,
  createAiModel,
  deleteAiModel,
  listAiModels,
  updateAiModel,
  reorderChatModels
} from './admin-model.service'

type ModelParams = {
  modelId: string
}

export async function listAiModelsController(_req: Request, res: Response) {
  const models = await listAiModels()
  sendSuccess(res, { models }, '获取模型配置成功')
}

export async function createAiModelController(req: Request, res: Response) {
  const model = await createAiModel(req.body)
  sendSuccess(res, model, '创建模型配置成功', 201)
}

export async function updateAiModelController(req: Request<ModelParams>, res: Response) {
  const model = await updateAiModel(req.params.modelId, req.body)
  sendSuccess(res, model, '更新模型配置成功')
}

export async function deleteAiModelController(req: Request<ModelParams>, res: Response) {
  await deleteAiModel(req.params.modelId)
  sendDeleted(res, '删除模型配置成功')
}

export async function applyChatModelToAllUsersController(req: Request, res: Response) {
  const result = await applyChatModelToAllUsers(req.body.modelId)
  sendSuccess(res, result, '已刷新所有用户的对话模型')
}

export async function reorderChatModelsController(req: Request, res: Response) {
  const models = await reorderChatModels(req.body.modelIds)
  sendSuccess(res, { models }, '对话模型排序已保存')
}
