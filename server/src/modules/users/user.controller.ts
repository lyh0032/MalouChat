import type { Request, Response } from 'express'

import { sendSuccess } from '../../utils/http'
import { updateUserLanguage, searchUsers } from './user.service'

export async function updateLanguageController(req: Request, res: Response) {
  const data = await updateUserLanguage(req.currentUser!.id, req.body.language)
  sendSuccess(res, data, '语言偏好已更新')
}

export async function searchUsersController(req: Request, res: Response) {
  const data = await searchUsers(req.currentUser!.id, String(req.query.q || ''))
  sendSuccess(res, data, '搜索用户成功')
}
