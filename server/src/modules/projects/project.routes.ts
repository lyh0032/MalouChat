import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import {
  createProjectController,
  deleteProjectController,
  listProjectsController,
  updateProjectController
} from './project.controller'
import {
  createProjectBodySchema,
  projectParamsSchema,
  updateProjectBodySchema
} from './project.schema'

const router = Router()

router.use(authMiddleware)
router.get('/', asyncHandler(listProjectsController))
router.post('/', validate({ body: createProjectBodySchema }), asyncHandler(createProjectController))
router.patch(
  '/:projectId',
  validate({ params: projectParamsSchema, body: updateProjectBodySchema }),
  asyncHandler(updateProjectController)
)
router.delete(
  '/:projectId',
  validate({ params: projectParamsSchema }),
  asyncHandler(deleteProjectController)
)

export { router as projectRouter }
