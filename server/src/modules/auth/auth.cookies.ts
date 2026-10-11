import type { Request, Response } from 'express'

import { env } from '../../config/env'

const REFRESH_TOKEN_COOKIE = 'my_agent_refresh_token'
const REFRESH_TOKEN_COOKIE_PATH = '/api/auth'

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: REFRESH_TOKEN_COOKIE_PATH
}

export function getRefreshTokenCookie(req: Request): string {
  const cookies = req.headers.cookie?.split(';') ?? []

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=')
    if (separatorIndex < 0) continue

    const name = cookie.slice(0, separatorIndex).trim()
    if (name !== REFRESH_TOKEN_COOKIE) continue

    const value = cookie.slice(separatorIndex + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return ''
    }
  }

  return ''
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...refreshTokenCookieOptions,
    maxAge: env.JWT_REFRESH_TOKEN_TTL_SECONDS * 1000
  })
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions)
}
