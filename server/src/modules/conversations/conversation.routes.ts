import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  createConversationController,
  deleteConversationController,
  getConversationDetailController,
  listConversationsController,
  pinConversationController,
  updateConversationController,
  updateConversationKnowledgeBaseController,
  updateConversationProjectController
} from './conversation.controller'
import {
  conversationParamsSchema,
  createConversationBodySchema,
  pinConversationBodySchema,
  updateConversationBodySchema,
  updateConversationProjectBodySchema
} from './conversation.schema'

const router = Router()

router.use(authMiddleware)
router.get('/', asyncHandler(listConversationsController))
router.post(
  '/',
  validate({ body: createConversationBodySchema }),
  asyncHandler(createConversationController)
)
router.get(
  '/:conversationId',
  validate({ params: conversationParamsSchema }),
  asyncHandler(getConversationDetailController)
)
router.patch(
  '/:conversationId',
  validate({ params: conversationParamsSchema, body: updateConversationBodySchema }),
  asyncHandler(updateConversationController)
)
router.patch(
  '/:conversationId/pin',
  validate({ params: conversationParamsSchema, body: pinConversationBodySchema }),
  asyncHandler(pinConversationController)
)
router.patch(
  '/:conversationId/knowledge-base',
  validate({ params: conversationParamsSchema }),
  asyncHandler(updateConversationKnowledgeBaseController)
)
router.patch(
  '/:conversationId/project',
  validate({ params: conversationParamsSchema, body: updateConversationProjectBodySchema }),
  asyncHandler(updateConversationProjectController)
)

router.delete(
  '/:conversationId',
  validate({ params: conversationParamsSchema }),
  asyncHandler(deleteConversationController)
)

export { router as conversationRouter }
