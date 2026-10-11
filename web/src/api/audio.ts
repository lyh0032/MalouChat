import type { ApiResponse } from '../types/api'
import { ensureFetchResponseOk, fetchWithAuth } from './http'

export async function transcribeAudio(audioBlob: Blob, signal?: AbortSignal): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')

  const response = await fetchWithAuth('/audio/transcribe', {
    method: 'POST',
    body: formData,
    signal
  })

  await ensureFetchResponseOk(response, '语音识别失败')

  const payload = (await response.json()) as ApiResponse<{ text: string }>
  return payload.data.text
}
