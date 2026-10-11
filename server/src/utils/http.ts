import type { Response } from 'express'

export function sendSuccess<T>(res: Response, data: T, message = 'ok', statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    message,
    data
  })
}

export function sendDeleted(res: Response, message = 'deleted'): void {
  res.status(200).json({
    success: true,
    message,
    data: {
      deleted: true
    }
  })
}
