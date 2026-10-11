import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

type FileAccessTokenPayload = {
  purpose: 'file-access'
  key: string
  userId?: string
  exp?: number
}

let s3Client: S3Client | null = null

const FILE_ACCESS_TOKEN_WINDOW_SECONDS = 7 * 24 * 60 * 60
const FILE_RESPONSE_CACHE_CONTROL = 'private, max-age=604800, immutable'

function getS3Endpoint(): string {
  if (env.STORAGE_ENDPOINT) return env.STORAGE_ENDPOINT
  if (!env.STORAGE_DOMAIN) throw new Error('STORAGE_DOMAIN 未配置')
  const url = new URL(env.STORAGE_DOMAIN)
  return `${url.protocol}//${url.host}`
}

function getS3Client(): S3Client {
  if (s3Client) return s3Client

  if (!env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY || !env.STORAGE_BUCKET) {
    throw new Error('对象存储配置不完整，请设置 STORAGE_ACCESS_KEY_ID、STORAGE_SECRET_ACCESS_KEY、STORAGE_BUCKET')
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
    }
  })

  return s3Client
}

function createObjectKey(sourceUrl: string) {
  const url = new URL(sourceUrl)
  const fileName = url.pathname.split('/').pop() || 'file'

  return `obs/${Date.now()}-${fileName}`
}

function createObjectKeyFromName(originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `obs/${Date.now()}-${safeName}`
}

function getStableFileAccessExpiresAt(now = Date.now()) {
  const currentSeconds = Math.floor(now / 1000)
  const windowStart =
    Math.floor(currentSeconds / FILE_ACCESS_TOKEN_WINDOW_SECONDS) *
    FILE_ACCESS_TOKEN_WINDOW_SECONDS

  return windowStart + FILE_ACCESS_TOKEN_WINDOW_SECONDS * 2
}

export async function putObject(sourceUrl: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(sourceUrl, { signal: options?.signal })
  if (!response.ok) {
    throw new Error(`获取源文件失败: HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const objectKey = createObjectKey(sourceUrl)

  const client = getS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: objectKey,
      Body: buffer,
      ContentType: response.headers.get('content-type') || 'application/octet-stream',
      CacheControl: FILE_RESPONSE_CACHE_CONTROL
    }),
    { abortSignal: options?.signal }
  )

  return { key: objectKey }
}

export async function formUpload(localFilePath: string, originalName: string, contentType?: string) {
  const key = createObjectKeyFromName(originalName)
  const fileBuffer = fs.readFileSync(localFilePath)

  const client = getS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: key,
      Body: fileBuffer,
      ...(contentType ? { ContentType: contentType } : {}),
      CacheControl: FILE_RESPONSE_CACHE_CONTROL
    })
  )

  return { key }
}

export async function getObjectBuffer(objectKey: string): Promise<Buffer> {
  const client = getS3Client()
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: objectKey
    })
  )

  if (!response.Body) {
    throw new Error('对象存储返回空内容')
  }

  const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> }

  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray())
  }

  const chunks: Buffer[] = []
  for await (const chunk of response.Body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export async function deleteObject(objectKey: string): Promise<void> {
  try {
    const client = getS3Client()
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.STORAGE_BUCKET!,
        Key: objectKey
      })
    )
  } catch (error) {
    console.error('对象存储删除失败:', error)
  }
}

export async function getPresignedUrl(
  objectKey: string,
  options?: { expiresIn?: number; responseContentDisposition?: string; responseCacheControl?: string | false }
): Promise<string> {
  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET!,
    Key: objectKey,
    ...(options?.responseContentDisposition
      ? { ResponseContentDisposition: options.responseContentDisposition }
      : {}),
    ...(options?.responseCacheControl === false
      ? {}
      : { ResponseCacheControl: options?.responseCacheControl ?? FILE_RESPONSE_CACHE_CONTROL })
  })

  return getSignedUrl(client, command, {
    expiresIn: options?.expiresIn ?? 604800
  })
}

export function signFileAccessToken(objectKey: string, userId?: string): string {
  const payload: FileAccessTokenPayload = {
    purpose: 'file-access',
    key: objectKey,
    userId,
    exp: getStableFileAccessExpiresAt()
  }

  return jwt.sign(payload, env.JWT_SECRET, { noTimestamp: true })
}

export function verifyFileAccessToken(
  token: string,
  options?: { ignoreExpiration?: boolean }
): FileAccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    ignoreExpiration: options?.ignoreExpiration
  }) as Partial<FileAccessTokenPayload>

  if (payload.purpose !== 'file-access' || !payload.key) {
    throw new Error('Invalid file access token')
  }

  return {
    purpose: 'file-access',
    key: payload.key,
    userId: payload.userId
  }
}

export function buildFileApiUrl(objectKey: string, options?: { userId?: string }): string {
  const token = signFileAccessToken(objectKey, options?.userId)
  return `/api/files/url?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`
}

export function getFileResponseCacheControl() {
  return FILE_RESPONSE_CACHE_CONTROL
}
