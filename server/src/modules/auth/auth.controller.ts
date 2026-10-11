import type { Request, Response } from 'express'

import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  setRefreshTokenCookie
} from './auth.cookies'
import {
  getCurrentUser,
  guestLogin,
  login,
  refreshSession,
  register,
  type AuthSession
} from './auth.service'
import { sendSuccess } from '../../utils/http'

function sendAuthSession(
  res: Response,
  session: AuthSession,
  message: string,
  statusCode = 200
) {
  const { refreshToken, ...payload } = session
  setRefreshTokenCookie(res, refreshToken)
  sendSuccess(res, payload, message, statusCode)
}

export async function registerController(req: Request, res: Response) {
  const data = await register(req.body)
  sendAuthSession(res, data, '注册成功', 201)
}

export async function loginController(req: Request, res: Response) {
  const data = await login(req.body)
  sendAuthSession(res, data, '登录成功')
}

export async function guestLoginController(req: Request, res: Response) {
  const data = await guestLogin(req.body)
  sendAuthSession(res, data, '访客登录成功')
}

export async function refreshController(req: Request, res: Response) {
  try {
    const data = await refreshSession(getRefreshTokenCookie(req))
    const { refreshToken, token } = data
    setRefreshTokenCookie(res, refreshToken)
    sendSuccess(res, { token }, '刷新 Token 成功')
  } catch (error) {
    clearRefreshTokenCookie(res)
    throw error
  }
}

export function logoutController(_req: Request, res: Response) {
  clearRefreshTokenCookie(res)
  sendSuccess(res, { loggedOut: true }, '已退出登录')
}

export async function meController(req: Request, res: Response) {
  const user = await getCurrentUser(req.currentUser!.id)
  sendSuccess(res, user, '获取当前用户成功')
}
