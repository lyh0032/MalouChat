import { env } from '../config/env'
import { prisma } from '../lib/prisma'
import { isAbortError, throwIfAborted } from '../utils/abort'
import { getPresignedUrl } from '../utils/obs'
import { getDefaultModelConfig } from './model-registry'

function buildVisionPrompt(userPrompt?: string) {
  const normalizedUserPrompt = userPrompt?.trim()

  if (!normalizedUserPrompt) {
    return '请简要描述这张图片的内容，包括图中的文字、场景、人物、物体等关键信息。'
  }

  return [
    '分析这张图片，分析结果将作为主对话模型回答用户时的图片上下文。',
    `用户本轮问题或诉求：${normalizedUserPrompt}`,
    '请优先围绕用户诉求提取信息：',
    '- 如果用户询问地点、物体、人物、场景，请给出可见依据，并在不确定时说明不确定性。',
    '- 如果用户要求识别图片文字，请尽量提取可见文字，保持原文和换行结构。',
    '- 如果用户要求图片优化、修图或 P 图，请描述图片现状、可优化方向、可能的编辑步骤，以及当前系统只能分析不能直接改图的限制。',
    '- 如果图片信息不足以支持用户诉求，请明确说明缺少哪些可见线索。',
    '不要直接代替主对话模型给最终回复，只返回可供主对话模型使用的图片理解结果。'
  ].join('\n')
}

export async function analyzeImage(
  imageUrl: string,
  userPrompt?: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (!env.LLM_API_KEY) return null

  throwIfAborted(signal)
  const prompt = buildVisionPrompt(userPrompt)

  try {
    const model = await getDefaultModelConfig('vision')
    if (userPrompt?.trim()) {
      console.log('[vision] request-aware-analysis', {
        promptLength: userPrompt.trim().length
      })
    }

    const response = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: model.code,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        stream: false
      })
    })

    if (!response.ok) {
      console.error('多模态分析失败:', response.status)
      return null
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return json.choices?.[0]?.message?.content?.trim() ?? null
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error
    console.error('多模态分析异常:', error)
    return null
  }
}

export async function analyzeImages(imageUrls: string[]): Promise<string> {
  const results: string[] = []

  for (let i = 0; i < imageUrls.length; i++) {
    const description = await analyzeImage(imageUrls[i])
    if (description) {
      results.push(`图片 ${i + 1}：${description}`)
    }
  }

  return results.join('\n')
}

export async function analyzeImagesParallel(imageUrls: string[]): Promise<string> {
  const descriptions = await Promise.all(imageUrls.map((url) => analyzeImage(url)))

  const results: string[] = []
  for (let i = 0; i < descriptions.length; i++) {
    if (descriptions[i]) {
      results.push(`图片 ${i + 1}：${descriptions[i]}`)
    }
  }

  return results.join('\n')
}

export async function runAndStoreVisionAnalysis(fileId: string) {
  try {
    const file = await prisma.fileUpload.findUnique({
      where: { id: fileId },
      select: { storageKey: true }
    })

    if (!file) return

    const url = await getPresignedUrl(file.storageKey, { responseCacheControl: false })
    const description = await analyzeImage(url)

    if (description) {
      await prisma.fileUpload.update({
        where: { id: fileId },
        data: { visionDescription: description }
      })
    }
  } catch (error) {
    console.error(`图片分析失败 (${fileId}):`, error)
  }
}

export function scheduleVisionAnalysis(fileId: string) {
  runAndStoreVisionAnalysis(fileId).catch((error) => {
    console.error('图片异步分析失败:', error)
  })
}
