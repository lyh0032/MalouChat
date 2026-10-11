import { env } from '../config/env'
import { AppError } from '../utils/app-error'
import { getDefaultModelConfig } from './model-registry'

const MIN_AUDIO_BYTES = 2048
const NATIVE_ASR_MODEL_PATTERN = /^qwen-audio-3\.\d+-asr-flash(?:-\d{4}-\d{2}-\d{2})?$/

function getAudioFormat(mimeType: string): string {
  const mediaType = mimeType.toLowerCase().split(';', 1)[0]
  const formats: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
    'audio/x-wav': 'wav'
  }

  const format = formats[mediaType]
  if (!format) {
    throw new AppError(400, '当前录音格式不受支持，请更换浏览器后重试', 'AUDIO_FORMAT_UNSUPPORTED')
  }
  return format
}

function getNativeAsrUrl(): string {
  const url = new URL(env.DASHSCOPE_BASE_URL)
  url.pathname = '/api/v1/services/aigc/multimodal-generation/generation'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function isValidSpeech(text: string): boolean {
  const cleaned = text.replace(/[\s\p{P}]/gu, '')

  if (cleaned.length < 2) {
    return false
  }

  const noisePatterns = [
    /^(啊|呃|嗯|哦|哎|哼|哈|咳|呸|嘶|啧|哟|喂|咯|嘎|嘘|嚓|咚|啪|呵|嚯)$/,
    /^[啊呃嗯哦哎哼哈咳呵]+$/
  ]

  for (const pattern of noisePatterns) {
    if (pattern.test(cleaned)) {
      return false
    }
  }

  return true
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  if (audioBuffer.length < MIN_AUDIO_BYTES) {
    throw new AppError(400, '未检测到有效语音，请录制清晰的人声后重试', 'AUDIO_TOO_SHORT')
  }

  const model = await getDefaultModelConfig('speech')
  const useNativeAsr = model.provider === 'dashscope' && NATIVE_ASR_MODEL_PATTERN.test(model.code)
  const apiKey = useNativeAsr ? env.DASHSCOPE_API_KEY : env.LLM_API_KEY
  if (!apiKey) {
    throw new AppError(500, '语音识别 API 未配置', 'MODEL_CONFIG_MISSING')
  }

  const format = getAudioFormat(mimeType)
  const mediaType = mimeType.toLowerCase().split(';', 1)[0]
  const base64Audio = audioBuffer.toString('base64')
  const dataUri = `data:${mediaType};base64,${base64Audio}`

  const response = await fetch(useNativeAsr ? getNativeAsrUrl() : `${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(
      useNativeAsr
        ? {
            model: model.code,
            input: {
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_audio',
                      input_audio: { data: dataUri }
                    }
                  ]
                }
              ]
            },
            parameters: { format }
          }
        : {
            model: model.code,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    input_audio: { data: dataUri }
                  }
                ]
              }
            ],
            stream: false,
            extra_body: {
              asr_options: {
                enable_itn: false,
                enable_voice_detection: true
              }
            }
          }
    )
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new AppError(
      502,
      `语音识别 API 请求失败: ${response.status} ${errorBody}`,
      'AUDIO_TRANSCRIBE_FAILED'
    )
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    output?: { text?: string }
  }

  const text = (useNativeAsr ? json.output?.text : json.choices?.[0]?.message?.content)?.trim() ?? ''

  if (!text) {
    throw new AppError(400, '未检测到有效语音，请录制清晰的人声后重试', 'AUDIO_TRANSCRIBE_EMPTY')
  }

  if (!isValidSpeech(text)) {
    throw new AppError(400, '未检测到有效语音，请录制清晰的人声后重试', 'AUDIO_INVALID_SPEECH')
  }

  return text
}
