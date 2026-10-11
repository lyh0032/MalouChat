import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  getConversationDraftController,
  updateConversationDraftKnowledgeBaseController
} from './conversation-draft.controller'
import { updateConversationDraftKnowledgeBaseBodySchema } from './conversation-draft.schema'

const router = Router()

router.use(authMiddleware)
router.get('/', asyncHandler(getConversationDraftController))
router.patch(
  '/knowledge-base',
  validate({ body: updateConversationDraftKnowledgeBaseBodySchema }),
  asyncHandler(updateConversationDraftKnowledgeBaseController)
)

export { router as conversationDraftRouter }
