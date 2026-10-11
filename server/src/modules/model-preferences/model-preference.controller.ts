import { Request, Response } from 'express'

import { sendSuccess } from '../../utils/http'
import { asyncHandler } from '../../utils/async-handler'
import {
  getAvailableModels,
  getUserPreferredModel,
  updateModelPreference
} from './model-preference.service'

export const getAvailableModelsController = asyncHandler(async (req: Request, res: Response) => {
  const models = await getAvailableModels()
  return sendSuccess(res, models)
})

export const getPreferredModelController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.currentUser!.id
  const preferredModel = await getUserPreferredModel(userId)
  return sendSuccess(res, preferredModel)
})

export const updateModelPreferenceController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.currentUser!.id
  const result = await updateModelPreference(userId, req.body)
  return sendSuccess(res, result)
})
