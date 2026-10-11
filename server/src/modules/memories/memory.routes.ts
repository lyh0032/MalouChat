import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  createMemoryController,
  deleteMemoryController,
  listMemoriesController,
  updateMemoryController
} from './memory.controller'
import {
  createMemoryBodySchema,
  memoryParamsSchema,
  memoryQuerySchema,
  updateMemoryBodySchema
} from './memory.schema'

const router = Router()

router.use(authMiddleware)
router.get('/', validate({ query: memoryQuerySchema }), asyncHandler(listMemoriesController))
router.post('/', validate({ body: createMemoryBodySchema }), asyncHandler(createMemoryController))
router.patch(
  '/:memoryId',
  validate({ params: memoryParamsSchema, body: updateMemoryBodySchema }),
  asyncHandler(updateMemoryController)
)
router.delete(
  '/:memoryId',
  validate({ params: memoryParamsSchema }),
  asyncHandler(deleteMemoryController)
)

export { router as memoryRouter }
