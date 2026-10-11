import type { Request, Response } from 'express'

import { sendSuccess } from '../../utils/http'
import {
  getAvailableSpeechStyles,
  getUserSpeechStyle,
  updateUserSpeechStyle
} from './user-preference.service'

export async function getAvailableSpeechStylesController(_req: Request, res: Response) {
  const styles = await getAvailableSpeechStyles()
  sendSuccess(res, styles)
}

export async function getSpeechStyleController(req: Request, res: Response) {
  const style = await getUserSpeechStyle(req.currentUser!.id)
  sendSuccess(res, style)
}

export async function updateSpeechStyleController(req: Request, res: Response) {
  const style = await updateUserSpeechStyle(req.currentUser!.id, req.body)
  sendSuccess(res, style, '更新语调偏好成功')
}
