import { env } from '../config/env'
import { getDefaultModelConfig } from './model-registry'

const MAX_RETRIES = 3
const BASE_DELAY = 200
const EMBEDDING_CONCURRENCY = 4

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!env.LLM_API_KEY || !text.trim()) return null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const model = await getDefaultModelConfig('embedding')
      const response = await fetch(`${env.LLM_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: model.code,
          input: text.slice(0, 8000)
        })
      })

      if (!response.ok) {
        console.error(`Embedding 失败 (${attempt + 1}/${MAX_RETRIES}):`, response.status)
        if (attempt < MAX_RETRIES - 1 && response.status >= 500) {
          await sleep(BASE_DELAY * Math.pow(2, attempt))
          continue
        }
        return null
      }

      const json = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>
      }
      const embedding = json.data?.[0]?.embedding
      if (!embedding?.length) {
        console.error(`Embedding 返回空 (${attempt + 1}/${MAX_RETRIES})`)
        if (attempt < MAX_RETRIES - 1) {
          await sleep(BASE_DELAY * Math.pow(2, attempt))
          continue
        }
        return null
      }
      return embedding
    } catch (error) {
      console.error(`Embedding 异常 (${attempt + 1}/${MAX_RETRIES}):`, error)
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_DELAY * Math.pow(2, attempt))
        continue
      }
      return null
    }
  }

  return null
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: Array<number[] | null> = new Array(texts.length).fill(null)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < texts.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await generateEmbedding(texts[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EMBEDDING_CONCURRENCY, texts.length) }, () => worker())
  )

  return results.map((e) => e ?? [])
}
