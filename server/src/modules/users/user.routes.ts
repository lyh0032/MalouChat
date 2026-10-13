import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import { updateLanguageController, searchUsersController } from './user.controller'
import { searchUsersQuerySchema } from './user.schema'

import { updateLanguageBodySchema } from './user.language'

const router = Router()

router.use(authMiddleware)
router.patch(
  '/me/language',
  validate({ body: updateLanguageBodySchema }),
  asyncHandler(updateLanguageController)
)
router.get(
  '/search',
  validate({ query: searchUsersQuerySchema }),
  asyncHandler(searchUsersController)
)

export { router as userRouter }
