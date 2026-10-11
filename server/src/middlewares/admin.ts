import type { RequestHandler } from 'express'

import { prisma } from '../lib/prisma'
import { AppError } from '../utils/app-error'

export const adminMiddleware: RequestHandler = async (req, _res, next) => {
  const userId = req.currentUser?.id

  if (!userId) {
    next(new AppError(401, '未登录或登录已过期', 'UNAUTHORIZED'))
    return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    })

    if (!user?.isAdmin) {
      next(new AppError(403, '没有后台管理权限', 'ADMIN_REQUIRED'))
      return
    }

    next()
  } catch (error) {
    next(error)
  }
}
