import { Router } from 'express'

import { adminMiddleware } from '../../middlewares/admin'
import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import {
  applyChatModelToAllUsersController,
  createAiModelController,
  deleteAiModelController,
  listAiModelsController,
  updateAiModelController,
  reorderChatModelsController
} from './admin-model.controller'
import {
  applyChatModelToAllBodySchema,
  aiModelParamsSchema,
  createAiModelBodySchema,
  updateAiModelBodySchema,
  reorderChatModelsBodySchema
} from './admin-model.schema'

const router = Router()

router.use(authMiddleware, adminMiddleware)
router.get('/', listAiModelsController)
router.post(
  '/chat/apply-to-all',
  validate({ body: applyChatModelToAllBodySchema }),
  applyChatModelToAllUsersController
)
router.put(
  '/chat/order',
  validate({ body: reorderChatModelsBodySchema }),
  reorderChatModelsController
)
router.post('/', validate({ body: createAiModelBodySchema }), createAiModelController)
router.put(
  '/:modelId',
  validate({ params: aiModelParamsSchema, body: updateAiModelBodySchema }),
  updateAiModelController
)
router.delete(
  '/:modelId',
  validate({ params: aiModelParamsSchema }),
  deleteAiModelController
)

export { router as adminModelRouter }
