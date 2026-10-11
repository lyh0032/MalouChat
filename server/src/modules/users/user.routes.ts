import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { validate } from '../../middlewares/validate'
import { asyncHandler } from '../../utils/async-handler'
import { searchUsersController } from './user.controller'
import { searchUsersQuerySchema } from './user.schema'

const router = Router()

router.use(authMiddleware)
router.get('/search', validate({ query: searchUsersQuerySchema }), asyncHandler(searchUsersController))

export { router as userRouter }
