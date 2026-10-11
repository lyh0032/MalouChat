import type { ApiResponse } from '../types/api'
import type { SpeechStyleInfo } from '../types/auth'
import { http } from './http'

export async function fetchAvailableSpeechStyles(): Promise<SpeechStyleInfo[]> {
  const response =
    await http.get<ApiResponse<SpeechStyleInfo[]>>('/user-preferences/speech-styles')
  return response.data.data
}

export async function fetchSpeechStyle(): Promise<SpeechStyleInfo> {
  const response = await http.get<ApiResponse<SpeechStyleInfo>>('/user-preferences/speech-style')
  return response.data.data
}

export async function updateSpeechStyle(speechStyle: string): Promise<SpeechStyleInfo> {
  const response = await http.put<ApiResponse<SpeechStyleInfo>>('/user-preferences/speech-style', {
    speechStyle
  })
  return response.data.data
}
