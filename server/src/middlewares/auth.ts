import type { RequestHandler } from 'express'

import { verifyToken } from '../lib/jwt'
import { AppError } from '../utils/app-error'

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    next(new AppError(401, '未登录或登录已过期', 'UNAUTHORIZED'))
    return
  }

  const token = authorization.slice('Bearer '.length).trim()

  try {
    const payload = verifyToken(token)
    req.currentUser = { id: payload.userId }
    next()
  } catch {
    next(new AppError(401, '未登录或登录已过期', 'UNAUTHORIZED'))
  }
}
