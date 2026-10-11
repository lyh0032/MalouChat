import type { Request, Response } from 'express'
import { uploadFile, detachFile, getPendingFiles, canUserAccessStorageKey } from './file.service'
import {
  buildFileApiUrl,
  getFileResponseCacheControl,
  getPresignedUrl,
  verifyFileAccessToken
} from '../../utils/obs'
import { sendSuccess, sendDeleted } from '../../utils/http'
import { verifyToken } from '../../lib/jwt'

type UrlMode = 'preview' | 'download'

type ResolveUrlItem = {
  storageKey?: string
  mode?: UrlMode
  filename?: string
}

function getBearerUserId(req: Request) {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  try {
    return verifyToken(authorization.slice('Bearer '.length).trim()).userId
  } catch {
    return null
  }
}

async function ensureStorageKeyAccess(req: Request, key: string) {
  const token = req.query.token as string | undefined

  if (token) {
    let payload: ReturnType<typeof verifyFileAccessToken>

    try {
      payload = verifyFileAccessToken(token)
    } catch {
      return false
    }

    if (payload.key !== key) {
      return false
    }

    if (!payload.userId) {
      return true
    }

    return canUserAccessStorageKey(payload.userId, key)
  }

  const userId = getBearerUserId(req)

  if (!userId) {
    return false
  }

  return canUserAccessStorageKey(userId, key)
}

export async function uploadController(req: Request, res: Response) {
  const file = req.file

  if (!file) {
    res.status(400).json({
      success: false,
      message: '请选择要上传的文件'
    })
    return
  }

  const conversationId = req.body.conversationId as string | undefined
  const useConversationDraft = req.body.conversationDraft === 'true'
  const result = await uploadFile(
    req.currentUser!.id,
    file,
    conversationId,
    useConversationDraft
  )
  sendSuccess(res, result)
}

export async function pendingController(req: Request, res: Response) {
  const conversationId = req.query.conversationId as string | undefined
  const files = await getPendingFiles(req.currentUser!.id, conversationId)
  sendSuccess(res, files)
}

function appendDownloadParams(url: string, filename?: string) {
  const params = new URLSearchParams()
  params.set('download', '1')
  if (filename) {
    params.set('filename', filename)
  }

  return `${url}&${params.toString()}`
}

export async function resolveUrlsController(req: Request, res: Response) {
  const items = Array.isArray(req.body?.items) ? (req.body.items as ResolveUrlItem[]) : []

  if (items.length === 0) {
    res.status(400).json({ success: false, message: '缺少 items 参数' })
    return
  }

  if (items.length > 100) {
    res.status(400).json({ success: false, message: '单次最多兑换 100 个文件地址' })
    return
  }

  const userId = req.currentUser!.id
  const results = await Promise.all(
    items.map(async (item) => {
      const storageKey = item.storageKey?.trim()
      const mode = item.mode === 'download' ? 'download' : 'preview'

      if (!storageKey) {
        return { storageKey: '', mode, filename: item.filename, url: '', error: '缺少 storageKey' }
      }

      const canAccess = await canUserAccessStorageKey(userId, storageKey)

      if (!canAccess) {
        return { storageKey, mode, filename: item.filename, url: '', error: '无权访问该文件' }
      }

      const previewUrl = buildFileApiUrl(storageKey, { userId })
      const url = mode === 'download' ? appendDownloadParams(previewUrl, item.filename) : previewUrl

      return {
        storageKey,
        mode,
        filename: item.filename,
        url
      }
    })
  )

  sendSuccess(res, { items: results }, '文件地址兑换成功')
}

export async function deleteController(req: Request, res: Response) {
  const fileId = req.params.id as string
  const conversationId = req.query.conversationId as string | undefined
  const conversationDraft = req.query.conversationDraft === 'true'
  await detachFile(req.currentUser!.id, fileId, { conversationId, conversationDraft })
  sendDeleted(res)
}

export async function urlController(req: Request, res: Response) {
  const key = req.query.key as string
  if (!key) {
    res.status(400).json({ success: false, message: '缺少 key 参数' })
    return
  }

  const canAccess = await ensureStorageKeyAccess(req, key)

  if (!canAccess) {
    res.status(403).json({ success: false, message: '无权访问该文件' })
    return
  }

  const download = req.query.download === '1'
  const filename = req.query.filename as string | undefined

  const url = await getPresignedUrl(
    key,
    download
      ? {
          responseContentDisposition: `attachment${filename ? `; filename="${encodeURIComponent(filename)}"` : ''}`,
          responseCacheControl: getFileResponseCacheControl()
        }
      : undefined
  )
  res.set('Cache-Control', getFileResponseCacheControl())
  res.redirect(302, url)
}
