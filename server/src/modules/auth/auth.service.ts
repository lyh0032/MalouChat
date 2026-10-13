import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import type { UserType } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt'
import { AppError } from '../../utils/app-error'
import type { GuestLoginBody, LoginBody, RegisterBody } from './auth.schema'

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  type: true,
  isAdmin: true,
  speechStyle: true,
  language: true,
  createdAt: true
} as const

type PublicUser = {
  id: string
  email: string
  username: string
  type: UserType
  isAdmin: boolean
  language: string
  speechStyle: string
  createdAt: Date
}

function toPublicUser(user: {
  id: string
  email: string
  username: string
  type: UserType
  isAdmin: boolean
  language: string
  speechStyle: string
  createdAt: Date
}): PublicUser {
  return {
    id: user.id,
    email: user.type === 'guest' ? '' : user.email,
    username: user.username,
    type: user.type,
    isAdmin: user.isAdmin,
    speechStyle: user.speechStyle,
    language: user.language,
    createdAt: user.createdAt
  }
}

export type AuthSession = {
  token: string
  refreshToken: string
  user?: PublicUser
  guestKey?: string
}

function issueTokenPair(userId: string) {
  return {
    token: signAccessToken(userId),
    refreshToken: signRefreshToken(userId)
  }
}

function hashGuestKey(guestKey: string) {
  return createHash('sha256').update(guestKey).digest('hex')
}

async function nextVisitorUsername() {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT nextval('"VisitorUsernameSeq"')::text AS value
  `
  const visitorNumber = rows[0]?.value

  if (!visitorNumber) {
    throw new AppError(500, '访客账号创建失败，请稍后重试', 'GUEST_CREATE_FAILED')
  }

  return `Visitor_${visitorNumber.padStart(4, '0')}`
}

async function createGuestUser(language = 'zh-CN') {
  const guestKey = randomBytes(32).toString('base64url')
  const guestSecretHash = hashGuestKey(guestKey)

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = await nextVisitorUsername()

    try {
      const user = await prisma.user.create({
        data: {
          email: `${username.toLowerCase()}-${randomBytes(8).toString('hex')}@guest.invalid`,
          username,
          passwordHash: `guest-disabled:${randomBytes(32).toString('hex')}`,
          type: 'guest',
          language,
          guestSecretHash,
          conversationDraft: {
            create: {}
          }
        },
        select: PUBLIC_USER_SELECT
      })

      return { user, guestKey }
    } catch (error) {
      const isUsernameConflict =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'

      if (!isUsernameConflict) throw error
    }
  }

  throw new AppError(500, '访客账号创建失败，请稍后重试', 'GUEST_CREATE_FAILED')
}

export async function register(data: RegisterBody) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: data.email }, { username: data.username }]
    }
  })

  if (existingUser?.email === data.email) {
    throw new AppError(409, '邮箱已被使用', 'EMAIL_TAKEN')
  }

  if (existingUser?.username === data.username) {
    throw new AppError(409, '用户名已被使用', 'USERNAME_TAKEN')
  }

  const passwordHash = await bcrypt.hash(data.password, 10)
  const isFirstUser = (await prisma.user.count({ where: { type: 'registered' } })) === 0

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      type: 'registered',
      language: data.language ?? 'zh-CN',
      isAdmin: isFirstUser,
      conversationDraft: {
        create: {}
      }
    },
    select: PUBLIC_USER_SELECT
  })

  return {
    ...issueTokenPair(user.id),
    user: toPublicUser(user)
  }
}

export async function login(data: LoginBody) {
  const user = await prisma.user.findFirst({
    where: {
      type: 'registered',
      OR: [{ email: data.emailOrUsername }, { username: data.emailOrUsername }]
    }
  })

  if (!user) {
    throw new AppError(401, '账号或密码错误', 'INVALID_CREDENTIALS')
  }

  const passwordMatched = await bcrypt.compare(data.password, user.passwordHash)

  if (!passwordMatched) {
    throw new AppError(401, '账号或密码错误', 'INVALID_CREDENTIALS')
  }

  return {
    ...issueTokenPair(user.id),
    user: toPublicUser(user)
  }
}

export async function guestLogin(data: GuestLoginBody) {
  const suppliedGuestKey = data.guestKey?.trim()

  if (suppliedGuestKey) {
    const existingGuest = await prisma.user.findFirst({
      where: {
        type: 'guest',
        guestSecretHash: hashGuestKey(suppliedGuestKey)
      },
      select: PUBLIC_USER_SELECT
    })

    if (existingGuest) {
      return {
        ...issueTokenPair(existingGuest.id),
        user: toPublicUser(existingGuest),
        guestKey: suppliedGuestKey
      }
    }
  }

  const { user, guestKey } = await createGuestUser(data.language)

  return {
    ...issueTokenPair(user.id),
    user: toPublicUser(user),
    guestKey
  }
}

export async function refreshSession(refreshToken: string) {
  let userId: string

  try {
    userId = verifyRefreshToken(refreshToken).userId
  } catch {
    throw new AppError(401, '登录已过期，请重新登录', 'REFRESH_TOKEN_INVALID')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, type: true }
  })

  if (!user) {
    throw new AppError(401, '用户不存在', 'UNAUTHORIZED')
  }

  return issueTokenPair(user.id)
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUBLIC_USER_SELECT
  })

  if (!user) {
    throw new AppError(401, '用户不存在', 'UNAUTHORIZED')
  }

  return toPublicUser(user)
}
