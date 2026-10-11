import type { RequestHandler } from 'express'

import { AppError } from '../utils/app-error'

export const notFoundMiddleware: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, '接口不存在', 'NOT_FOUND'))
}
