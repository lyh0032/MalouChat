import type { Request, Response } from 'express'

import { transcribeAudio } from '../../lib/audio'
import { AppError } from '../../utils/app-error'
import { sendSuccess } from '../../utils/http'

export async function transcribeAudioController(req: Request, res: Response) {
  const file = req.file

  if (!file) {
    throw new AppError(400, '未上传音频文件', 'AUDIO_FILE_MISSING')
  }

  let transcribedText: string

  try {
    transcribedText = await transcribeAudio(file.buffer, file.mimetype)
  } catch (error) {
    throw error instanceof AppError
      ? error
      : new AppError(502, '语音识别失败', 'AUDIO_TRANSCRIBE_FAILED')
  }

  sendSuccess(res, { text: transcribedText }, '语音识别成功')
}
