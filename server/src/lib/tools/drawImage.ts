import { env } from '../../config/env'
import { putObject } from '../../utils/obs'
import { z } from 'zod/v3'
import { createStructuredTool } from './createStructuredTool'
import { getDefaultModelConfig, getImageModelSettings } from '../model-registry'
import { getToolContext } from '../tool-context'
import { isAbortError, throwIfAborted } from '../../utils/abort'
import {
  getFriendlyImageGenerationError,
  ImageGenerationProviderError
} from './image-generation-error'

type DashScopeImageResponse = {
  request_id?: string
  code?: string
  message?: string
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string
        }>
      }
    }>
  }
}

type UploadedImage = {
  key: string
}

const DEFAULT_NEGATIVE_PROMPT =
  '低分辨率，低画质，肢体畸形，手指畸形，构图混乱，文字模糊，扭曲，过度平滑，强烈 AI 感。'

const drawImageToolInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(800)
      .optional()
      .describe('图片生成提示词，描述你想要生成的画面内容。'),
    query: z.string().trim().min(1).max(800).optional().describe('兼容旧参数，等价于 prompt。'),
    negativePrompt: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe('可选的反向提示词，用来描述不希望在图像中出现的内容。'),
    size: z
      .string()
      .regex(/^\d+\*\d+$/, 'size 必须是 宽*高 格式，例如 1024*1024')
      .optional()
      .describe('可选的输出尺寸，格式为 宽*高，例如 1024*1024。')
  })
  .refine((input) => Boolean(input.prompt || input.query), {
    message: 'prompt 或 query 至少需要提供一个字段。'
  })

function ensureImageApiKey() {
  if (!env.IMAGE_API_KEY) {
    throw new Error(
      '未配置 DASHSCOPE_IMAGE_API_KEY 或 DASHSCOPE_API_KEY，无法调用阿里云文生图接口。'
    )
  }

  return env.IMAGE_API_KEY
}

function buildDashScopeImageEndpoint() {
  return env.DASHSCOPE_IMAGE_GENERATION_URL
}

function sanitizeAltText(text: string) {
  return (
    text
      .replace(/[\r\n\[\]\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '生成图片'
  )
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text)
  }
}

async function callQwenImageApi(input: {
  model: string
  prompt: string
  negativePrompt?: string
  size: string
  promptExtend: boolean
  watermark: boolean
}, signal?: AbortSignal) {
  const response = await fetch(buildDashScopeImageEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ensureImageApiKey()}`
    },
    body: JSON.stringify({
      model: input.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: input.prompt }]
          }
        ]
      },
      parameters: {
        size: input.size,
        prompt_extend: input.promptExtend,
        watermark: input.watermark,
        negative_prompt: input.negativePrompt || DEFAULT_NEGATIVE_PROMPT
      }
    }),
    signal
  })

  const payload = await parseJsonResponse<DashScopeImageResponse>(response)

  if (!response.ok || payload?.code) {
    throw new ImageGenerationProviderError(
      payload?.message || payload?.code || '阿里云文生图接口调用失败',
      response.status,
      payload?.code
    )
  }

  const imageUrl = payload?.output?.choices?.[0]?.message?.content?.find(
    (item) => item.image
  )?.image

  if (!imageUrl) {
    throw new Error('阿里云文生图接口未返回图片地址')
  }

  return {
    imageUrl,
    requestId: payload?.request_id || ''
  }
}

function canUploadToObs() {
  return Boolean(env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY)
}

async function uploadImageToObs(
  sourceUrl: string,
  signal?: AbortSignal
): Promise<UploadedImage | null> {
  if (!canUploadToObs()) {
    console.log('obs配置不完整')
    return null
  }
  const uploaded = await putObject(sourceUrl, { signal })

  return {
    key: uploaded.key
  }
}

function buildToolResponse(params: {
  prompt: string
  storageKey: string
}) {
  const altText = sanitizeAltText(params.prompt)
  return `![${altText}](storage-key:${encodeURIComponent(params.storageKey)})`
}

export const drawImageTool = createStructuredTool(
  async (input) => {
    const { prompt, query, negativePrompt, size } = drawImageToolInputSchema.parse(input)
    const resolvedPrompt = prompt || query
    const { signal } = getToolContext()

    if (!resolvedPrompt) {
      throw new Error('缺少图片生成提示词')
    }

    try {
      throwIfAborted(signal)
      const model = await getDefaultModelConfig('image')
      const imageSettings = getImageModelSettings(model)
      const resolvedSize = size || imageSettings.size
      const generated = await callQwenImageApi({
        model: model.code,
        prompt: resolvedPrompt,
        negativePrompt,
        size: resolvedSize,
        promptExtend: imageSettings.promptExtend,
        watermark: imageSettings.watermark
      }, signal)
      throwIfAborted(signal)
      console.log('OBS-1', generated.imageUrl)
      const uploaded = await uploadImageToObs(generated.imageUrl, signal).catch((error) => {
        if (isAbortError(error) || signal?.aborted) {
          throw error
        }

        console.error('对象存储上传失败，回退临时图片地址:', error)
        return null
      })
      throwIfAborted(signal)
      console.log('OBS-2', uploaded?.key)

      if (!uploaded) {
        throw new Error('图片已生成，但对象存储上传失败，无法保存为长期可访问的 storageKey。')
      }

      return buildToolResponse({
        prompt: resolvedPrompt,
        storageKey: uploaded.key
      })
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error
      }

      return `图片生成失败：${getFriendlyImageGenerationError(error)}`
    }
  },
  {
    name: 'drawImageTool',
    description:
      '用于根据用户描述生成图片。当用户要求画图、生成海报、创作图片、做视觉效果图时使用。',
    schema: drawImageToolInputSchema
  }
)
