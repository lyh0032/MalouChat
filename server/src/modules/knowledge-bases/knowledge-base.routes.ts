import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  acceptKnowledgeBaseInvitationController,
  createKnowledgeBaseController,
  deleteKnowledgeBaseController,
  inviteKnowledgeBaseMembersController,
  leaveKnowledgeBaseController,
  listKnowledgeBaseInvitationsController,
  listKnowledgeBaseMembersController,
  listKnowledgeBasesController,
  rejectKnowledgeBaseInvitationController,
  removeKnowledgeBaseMemberController,
  updateKnowledgeBaseVisibilityController,
  updateKnowledgeBaseController
} from './knowledge-base.controller'
import {
  knowledgeBaseInvitationParamsSchema,
  knowledgeBaseParamsSchema,
  knowledgeBaseUserParamsSchema
} from './knowledge-base.schema'

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads/tmp')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
})

const router = Router()

router.use(authMiddleware)
router.get('/invitations', asyncHandler(listKnowledgeBaseInvitationsController))
router.post(
  '/invitations/:invitationId/accept',
  validate({ params: knowledgeBaseInvitationParamsSchema }),
  asyncHandler(acceptKnowledgeBaseInvitationController)
)
router.post(
  '/invitations/:invitationId/reject',
  validate({ params: knowledgeBaseInvitationParamsSchema }),
  asyncHandler(rejectKnowledgeBaseInvitationController)
)
router.get('/', asyncHandler(listKnowledgeBasesController))
router.post('/', upload.single('file'), asyncHandler(createKnowledgeBaseController))
router.patch(
  '/:id',
  validate({ params: knowledgeBaseParamsSchema }),
  upload.single('file'),
  asyncHandler(updateKnowledgeBaseController)
)
router.patch(
  '/:id/visibility',
  validate({ params: knowledgeBaseParamsSchema }),
  asyncHandler(updateKnowledgeBaseVisibilityController)
)
router.get(
  '/:id/members',
  validate({ params: knowledgeBaseParamsSchema }),
  asyncHandler(listKnowledgeBaseMembersController)
)
router.post(
  '/:id/invitations',
  validate({ params: knowledgeBaseParamsSchema }),
  asyncHandler(inviteKnowledgeBaseMembersController)
)
router.delete(
  '/:id/members/:userId',
  validate({ params: knowledgeBaseUserParamsSchema }),
  asyncHandler(removeKnowledgeBaseMemberController)
)
router.delete(
  '/:id/leave',
  validate({ params: knowledgeBaseParamsSchema }),
  asyncHandler(leaveKnowledgeBaseController)
)
router.delete(
  '/:id',
  validate({ params: knowledgeBaseParamsSchema }),
  asyncHandler(deleteKnowledgeBaseController)
)

export { router as knowledgeBaseRouter }
