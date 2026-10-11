import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

import { asyncHandler } from '../../utils/async-handler'
import { authMiddleware } from '../../middlewares/auth'
import {
  uploadController,
  deleteController,
  pendingController,
  resolveUrlsController,
  urlController
} from './file.controller'

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads/tmp')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }
})

const router = Router()

router.get('/url', asyncHandler(urlController))
router.post('/url', authMiddleware, asyncHandler(resolveUrlsController))
router.get('/pending', authMiddleware, asyncHandler(pendingController))
router.post('/upload', authMiddleware, upload.single('file'), asyncHandler(uploadController))
router.delete('/:id', authMiddleware, asyncHandler(deleteController))

export { router as fileRouter }
