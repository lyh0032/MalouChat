import jwt from 'jsonwebtoken'

import { env } from '../config/env'

type TokenType = 'access' | 'refresh'

export type AuthJwtPayload = {
  userId: string
  tokenType: TokenType
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId, tokenType: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS
  })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, tokenType: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TOKEN_TTL_SECONDS
  })
}

function verifyTokenByType(token: string, expectedType: TokenType): AuthJwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET)

  if (
    typeof payload === 'string' ||
    typeof payload.userId !== 'string' ||
    payload.tokenType !== expectedType
  ) {
    throw new jwt.JsonWebTokenError('Invalid token type')
  }

  return payload as AuthJwtPayload
}

export function verifyToken(token: string): AuthJwtPayload {
  return verifyTokenByType(token, 'access')
}

export function verifyRefreshToken(token: string): AuthJwtPayload {
  return verifyTokenByType(token, 'refresh')
}
