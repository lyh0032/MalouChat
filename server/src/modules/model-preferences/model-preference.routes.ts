import { Router } from 'express'

import { asyncHandler } from '../../utils/async-handler'
import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import {
  getAvailableModelsController,
  getPreferredModelController,
  updateModelPreferenceController
} from './model-preference.controller'
import { updateModelPreferenceBodySchema } from './model-preference.schema'

const router = Router()

router.get('/available', authMiddleware, asyncHandler(getAvailableModelsController))
router.get('/preferred', authMiddleware, asyncHandler(getPreferredModelController))
router.put(
  '/preferred',
  authMiddleware,
  validate({ body: updateModelPreferenceBodySchema }),
  asyncHandler(updateModelPreferenceController)
)

export { router as modelPreferenceRouter }
