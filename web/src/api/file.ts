import { getStoredToken } from '../utils/token'
import { apiBaseUrl, ensureFreshAccessToken, ensureFetchResponseOk, fetchWithAuth } from './http'

export type UploadedFile = {
  id: string
  originalName: string
  mimeType: string
  size: number
  storageKey: string
  kind: 'image' | 'file'
  processingStatus?: string
}

export type FileUrlMode = 'preview' | 'download'

export type FileUrlResolveInput = {
  storageKey: string
  mode: FileUrlMode
  filename?: string
}

export type FileUrlResolveResult = FileUrlResolveInput & {
  url: string
  error?: string
}

export async function uploadFile(
  file: File,
  conversationId?: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  useConversationDraft = false
): Promise<UploadedFile> {
  await ensureFreshAccessToken()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    if (conversationId) {
      formData.append('conversationId', conversationId)
    }
    if (useConversationDraft) {
      formData.append('conversationDraft', 'true')
    }
    const token = getStoredToken()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText)
          resolve(json.data)
        } catch {
          reject(new Error('解析响应失败'))
        }
      } else {
        try {
          const json = JSON.parse(xhr.responseText)
          reject(new Error(json.message || '上传失败'))
        } catch {
          reject(new Error('上传失败'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('网络错误')))
    xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort())
    }

    xhr.open('POST', `${apiBaseUrl}/files/upload`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}

export async function fetchPendingFiles(conversationId?: string): Promise<UploadedFile[]> {
  const params = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
  const response = await fetchWithAuth(`/files/pending${params}`, { method: 'GET' })
  await ensureFetchResponseOk(response, '获取文件列表失败')
  const json = await response.json()
  return json.data as UploadedFile[]
}

export async function deleteFile(
  fileId: string,
  options?: { conversationId?: string; conversationDraft?: boolean }
): Promise<void> {
  const params = new URLSearchParams()
  if (options?.conversationId) params.set('conversationId', options.conversationId)
  if (options?.conversationDraft) params.set('conversationDraft', 'true')
  const suffix = params.size ? `?${params.toString()}` : ''
  const response = await fetchWithAuth(`/files/${fileId}${suffix}`, { method: 'DELETE' })
  await ensureFetchResponseOk(response, '删除文件失败')
}

export async function resolveFileUrls(items: FileUrlResolveInput[]): Promise<FileUrlResolveResult[]> {
  const response = await fetchWithAuth('/files/url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items })
  })
  await ensureFetchResponseOk(response, '获取文件地址失败')
  const json = await response.json()
  return json.data.items as FileUrlResolveResult[]
}
