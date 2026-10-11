import type { Request, Response } from 'express'

import { sendSuccess } from '../../utils/http'
import { searchUsers } from './user.service'

export async function searchUsersController(req: Request, res: Response) {
  const data = await searchUsers(req.currentUser!.id, String(req.query.q || ''))
  sendSuccess(res, data, '搜索用户成功')
}
