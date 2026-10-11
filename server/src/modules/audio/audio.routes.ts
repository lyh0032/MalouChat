import { Router } from 'express'
import multer from 'multer'

import { authMiddleware } from '../../middlewares/auth'
import { asyncHandler } from '../../utils/async-handler'
import { transcribeAudioController } from './audio.controller'

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const audioFileUpload = audioUpload.single('audio')

const router = Router()

router.use(authMiddleware)
router.post('/transcribe', audioFileUpload, asyncHandler(transcribeAudioController))

export { router as audioRouter }
