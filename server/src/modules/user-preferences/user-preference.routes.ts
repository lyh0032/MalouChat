import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  getAvailableSpeechStylesController,
  getSpeechStyleController,
  updateSpeechStyleController
} from './user-preference.controller'
import { updateSpeechStyleBodySchema } from './user-preference.schema'

const router = Router()

router.use(authMiddleware)
router.get('/speech-styles', asyncHandler(getAvailableSpeechStylesController))
router.get('/speech-style', asyncHandler(getSpeechStyleController))
router.put(
  '/speech-style',
  validate({ body: updateSpeechStyleBodySchema }),
  asyncHandler(updateSpeechStyleController)
)

export { router as userPreferenceRouter }
