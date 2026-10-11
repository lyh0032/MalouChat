import type { Message as PrismaMessage } from '@prisma/client'

export type MessageFile = {
  id?: string
  name: string
  storageKey: string
  kind: 'image' | 'file'
  size?: number
}

type StoredMessageFile = {
  id?: string
  name: string
  storageKey?: string
  kind: 'image' | 'file'
  size?: number
}

export type ClientMessage = PrismaMessage & {
  fileList: MessageFile[]
  type?: string
}

const markdownImagePattern = /!\[(.*?)\]\(((?:https?:\/\/|\/)[^\s)]+)(?:\s+"(.*?)")?\)/g
const markdownLinkPattern = /\[(.*?)\]\(((?:https?:\/\/|\/)[^\s)]+)(?:\s+"(.*?)")?\)/g
const directUrlPattern = /(?:https?:\/\/|\/api\/files\/url\?key=)[^\s)]+/g
const imageExtensionPattern = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i

function getFileNameFromUrl(url: string) {
  try {
    if (url.startsWith('/')) {
      const params = new URLSearchParams(url.split('?')[1] || '')
      const key = params.get('key') || ''
      return key.split('/').pop() || 'file'
    }
    const parsedUrl = new URL(url)
    const fileName = parsedUrl.pathname.split('/').pop() || ''
    return decodeURIComponent(fileName) || 'file'
  } catch {
    return 'file'
  }
}

function getFileApiUrlAccess(url: string) {
  try {
    const parsedUrl = new URL(url, 'http://local')
    if (parsedUrl.pathname !== '/api/files/url') {
      return null
    }

    const key = parsedUrl.searchParams.get('key')
    if (!key) {
      return null
    }

    return { key }
  } catch {
    return null
  }
}

function getStorageKeyFromFileApiUrl(url: string) {
  return getFileApiUrlAccess(url)?.key
}

function getFileKind(url: string): MessageFile['kind'] {
  return imageExtensionPattern.test(url) ? 'image' : 'file'
}

function pushUniqueFile(target: MessageFile[], file: MessageFile) {
  if (target.some((item) => item.storageKey === file.storageKey)) {
    return
  }
  target.push(file)
}

function buildMessageFileFromUrl(params: {
  name: string
  url: string
  kind: MessageFile['kind']
  size?: number
}): MessageFile | null {
  const storageKey = getStorageKeyFromFileApiUrl(params.url)

  if (!storageKey) {
    return null
  }

  return {
    name: params.name,
    storageKey,
    kind: params.kind,
    size: params.size
  }
}

export function extractFileListFromContent(content: string): MessageFile[] {
  const fileList: MessageFile[] = []

  for (const match of content.matchAll(markdownImagePattern)) {
    const [, alt = '', url = ''] = match
    if (!url) continue
    const file = buildMessageFileFromUrl({
      name: alt || getFileNameFromUrl(url),
      url,
      kind: 'image'
    })
    if (file) pushUniqueFile(fileList, file)
  }

  for (const match of content.matchAll(markdownLinkPattern)) {
    const [, text = '', url = ''] = match
    if (!url) continue
    const file = buildMessageFileFromUrl({
      name: text || getFileNameFromUrl(url),
      url,
      kind: getFileKind(url)
    })
    if (file) pushUniqueFile(fileList, file)
  }

  for (const match of content.matchAll(directUrlPattern)) {
    const [url = ''] = match
    if (!url) continue
    const file = buildMessageFileFromUrl({
      name: getFileNameFromUrl(url),
      url,
      kind: getFileKind(url)
    })
    if (file) pushUniqueFile(fileList, file)
  }

  return fileList
}

function serializeMessageFile(file: StoredMessageFile): MessageFile {
  if (file.storageKey) {
    return {
      id: file.id,
      name: file.name,
      storageKey: file.storageKey,
      kind: file.kind,
      size: file.size
    }
  }

  return {
    id: file.id,
    name: file.name,
    storageKey: '',
    kind: file.kind,
    size: file.size
  }
}

export function serializeMessageForClient(message: PrismaMessage): ClientMessage {
  const rawFileList = (message as Record<string, unknown>).fileList

  if (Array.isArray(rawFileList) && rawFileList.length > 0) {
    return {
      ...message,
      fileList: (rawFileList as unknown as StoredMessageFile[])
        .map(serializeMessageFile)
        .filter((file) => Boolean(file.storageKey))
    }
  }

  return { ...message, fileList: extractFileListFromContent(message.content) }
}
