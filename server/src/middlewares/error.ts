import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

import { AppError } from '../utils/app-error'

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: '请求参数校验失败',
      errorCode: 'VALIDATION_ERROR',
      errors: error.flatten()
    })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorCode: error.errorCode,
      errors: error.details ?? null
    })
    return
  }

  console.error(error)

  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    errorCode: 'INTERNAL_SERVER_ERROR'
  })
}
