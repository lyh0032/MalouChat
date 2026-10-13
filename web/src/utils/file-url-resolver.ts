import { localizeErrorMessage } from '../i18n/errors'
import { t } from '../i18n'
import { resolveFileUrls, type FileUrlMode, type FileUrlResolveInput } from '../api/file'

type PendingRequest = {
  input: FileUrlResolveInput
  resolve: (url: string) => void
  reject: (error: Error) => void
}

const BATCH_DELAY_MS = 50
const CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000

const cache = new Map<string, { url: string; expiresAt: number }>()
const pending = new Map<string, PendingRequest[]>()

let flushTimer: ReturnType<typeof setTimeout> | null = null

function buildRequestKey(input: FileUrlResolveInput) {
  return [input.mode, input.storageKey, input.filename ?? ''].join('::')
}

function scheduleFlush() {
  if (flushTimer) return

  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushPendingRequests()
  }, BATCH_DELAY_MS)
}

async function flushPendingRequests() {
  const entries = Array.from(pending.entries())
  pending.clear()

  if (entries.length === 0) return

  const inputs = entries.map(([, requests]) => requests[0].input)

  try {
    const results = await resolveFileUrls(inputs)

    for (let index = 0; index < entries.length; index += 1) {
      const [key, requests] = entries[index]
      const result = results[index]

      if (!result?.url || result.error) {
        const error = new Error(
          localizeErrorMessage(result?.error || t('ui.failedToResolveTheFileUrl'))
        )
        requests.forEach((request) => request.reject(error))
        continue
      }

      cache.set(key, {
        url: result.url,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      requests.forEach((request) => request.resolve(result.url))
    }
  } catch (error) {
    const resolvedError =
      error instanceof Error ? error : new Error(t('ui.failedToResolveTheFileUrl'))
    entries.forEach(([, requests]) => {
      requests.forEach((request) => request.reject(resolvedError))
    })
  }
}

export function resolveFileUrl(
  storageKey: string,
  mode: FileUrlMode = 'preview',
  filename?: string
): Promise<string> {
  const input: FileUrlResolveInput = { storageKey, mode, filename }
  const key = buildRequestKey(input)
  const cached = cache.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.url)
  }

  return new Promise((resolve, reject) => {
    const requests = pending.get(key) ?? []
    requests.push({ input, resolve, reject })
    pending.set(key, requests)
    scheduleFlush()
  })
}
