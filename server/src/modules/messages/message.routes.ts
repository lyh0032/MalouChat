import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  cancelMessageStreamController,
  clientToolResultController,
  deleteMessageController,
  regenerateMessageController,
  subscribeMessageStreamController,
  streamMessageController,
  updateMessageController
} from './message.controller'
import {
  createMessageBodySchema,
  clientToolResultBodySchema,
  deleteMessageParamsSchema,
  messageParamsSchema,
  messageStreamParamsSchema,
  regenerateMessageBodySchema,
  regenerateMessageParamsSchema,
  updateMessageBodySchema,
  updateMessageParamsSchema
} from './message.schema'

const router = Router({ mergeParams: true })

router.use(authMiddleware)
router.post(
  '/stream',
  validate({ params: messageParamsSchema, body: createMessageBodySchema }),
  asyncHandler(streamMessageController)
)
router.get(
  '/:messageId/stream',
  validate({ params: messageStreamParamsSchema }),
  asyncHandler(subscribeMessageStreamController)
)
router.post(
  '/:messageId/cancel',
  validate({ params: messageStreamParamsSchema }),
  asyncHandler(cancelMessageStreamController)
)
router.post(
  '/:messageId/client-tool-result',
  validate({ params: messageStreamParamsSchema, body: clientToolResultBodySchema }),
  asyncHandler(clientToolResultController)
)
router.patch(
  '/:messageId',
  validate({ params: updateMessageParamsSchema, body: updateMessageBodySchema }),
  asyncHandler(updateMessageController)
)
router.delete(
  '/:messageId',
  validate({ params: deleteMessageParamsSchema }),
  asyncHandler(deleteMessageController)
)
router.post(
  '/:messageId/regenerate',
  validate({ params: regenerateMessageParamsSchema, body: regenerateMessageBodySchema }),
  asyncHandler(regenerateMessageController)
)

export { router as messageRouter }
