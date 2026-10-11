import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { PDFParse } from 'pdf-parse'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { formUpload } from '../../utils/obs'
import { processFileForRAG } from './rag.service'
import { scheduleVisionAnalysis } from '../../lib/vision'
import { Prisma } from '@prisma/client'
import { attachFileToConversationDraft } from '../conversation-drafts/conversation-draft.service'
import {
  attachPendingFileReference,
  detachComposerFile
} from './file-reference.service'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.yaml', '.yml',
  '.log', '.env', '.cfg', '.ini', '.toml',
  '.sh', '.bash', '.zsh', '.ps1',
  '.js', '.ts', '.jsx', '.tsx', '.vue',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs',
  '.swift', '.kt', '.scala',
  '.html', '.htm', '.css', '.scss', '.less',
  '.sql', '.graphql', '.proto'
])

const MAX_TEXT_EXTRACT_SIZE = 100 * 1024
const MAX_PDF_SIZE = 50 * 1024 * 1024
const MAX_DOC_SIZE = 20 * 1024 * 1024
const MAX_TEXT_CONTENT_LENGTH = 50000

function determineKind(mimeType: string): 'image' | 'file' {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

function getExtension(originalName: string): string {
  return path.extname(originalName).toLowerCase()
}

function canExtractText(originalName: string, mimeType?: string): boolean {
  const ext = getExtension(originalName)
  if (ext === '.pdf' || mimeType === 'application/pdf') return true
  if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (ext === '.xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true
  return TEXT_EXTENSIONS.has(ext)
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 4096)
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

function tryReadUtf8(filePath: string, size: number): string | null {
  if (size > MAX_TEXT_EXTRACT_SIZE) return null
  try {
    const buffer = fs.readFileSync(filePath)
    if (isBinaryBuffer(buffer)) return null
    const content = buffer.toString('utf-8')
    return content.slice(0, MAX_TEXT_CONTENT_LENGTH)
  } catch {
    return null
  }
}

async function extractPdfContent(filePath: string, size: number): Promise<string | null> {
  if (size > MAX_PDF_SIZE) return null
  try {
    const buffer = fs.readFileSync(filePath)
    const pdf = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await pdf.getText()
    await pdf.destroy()
    return (result.text || '').slice(0, MAX_TEXT_CONTENT_LENGTH)
  } catch {
    return null
  }
}

async function extractDocxContent(filePath: string, size: number): Promise<string | null> {
  if (size > MAX_DOC_SIZE) return null
  try {
    const buffer = fs.readFileSync(filePath)
    const result = await mammoth.extractRawText({ buffer })
    return (result.value || '').slice(0, MAX_TEXT_CONTENT_LENGTH)
  } catch {
    return null
  }
}

async function extractXlsxContent(filePath: string, size: number): Promise<string | null> {
  if (size > MAX_DOC_SIZE) return null
  try {
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const parts: string[] = []
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      parts.push(`--- ${name} ---\n${csv}`)
    }
    return parts.join('\n\n').slice(0, MAX_TEXT_CONTENT_LENGTH)
  } catch {
    return null
  }
}

function formatFileRecord(record: {
  id: string
  userId: string
  originalName: string
  mimeType: string
  size: number
  storageKey: string
  kind: string
  processingStatus: string
}) {
  return {
    id: record.id,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    storageKey: record.storageKey,
    kind: record.kind,
    processingStatus: record.processingStatus
  }
}

export async function uploadFile(
  userId: string,
  file: Express.Multer.File,
  conversationId?: string,
  useConversationDraft = false
) {
  const { path: filePath, mimetype, size } = file
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const ext = getExtension(originalName)
  const kind = determineKind(mimetype)
  let textContent: string | null = null

  if (canExtractText(originalName, mimetype)) {
    if (ext === '.pdf' || mimetype === 'application/pdf') {
      textContent = await extractPdfContent(filePath, size)
    } else if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      textContent = await extractDocxContent(filePath, size)
    } else if (ext === '.xlsx' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      textContent = await extractXlsxContent(filePath, size)
    } else {
      textContent = tryReadUtf8(filePath, size)
    }
  }

  const storageKey = `obs/${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  let record: {
    id: string
    userId: string
    originalName: string
    mimeType: string
    size: number
    storageKey: string
    kind: string
    textContent?: string | null
    processingStatus: string
  }

  if (env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY) {
    const uploaded = await formUpload(filePath, originalName, mimetype)

    fs.unlink(filePath, () => {})

    record = await prisma.fileUpload.create({
      data: {
        userId,
        originalName,
        mimeType: mimetype,
        size,
        storageKey: uploaded.key,
        storageUrl: '',
        kind,
        textContent,
        conversationId: conversationId ?? null
      }
    })

    scheduleRagProcessing(record.id)
    if (kind === 'image') scheduleVisionAnalysis(record.id)
  } else {
    const LOCAL_UPLOAD_DIR = filePath.substring(0, filePath.lastIndexOf('/'))
    const permanentPath = `${LOCAL_UPLOAD_DIR}/${storageKey.replace('/', '_')}`
    fs.renameSync(filePath, permanentPath)

    record = await prisma.fileUpload.create({
      data: {
        userId,
        originalName,
        mimeType: mimetype,
        size,
        storageKey,
        storageUrl: '',
        kind,
        textContent,
        conversationId: conversationId ?? null
      }
    })

    scheduleRagProcessing(record.id)
    if (kind === 'image') scheduleVisionAnalysis(record.id)
  }

  if (!conversationId && useConversationDraft) {
    await attachFileToConversationDraft(userId, record.id)
  } else if (conversationId) {
    await attachPendingFileReference(userId, record.id, conversationId)
  }

  return formatFileRecord(record)
}

function scheduleRagProcessing(fileId: string) {
  processFileForRAG(fileId).catch((error) => {
    console.error('RAG 异步处理失败:', error)
  })
}

export async function getPendingFiles(userId: string, conversationId?: string) {
  const records = await prisma.fileUpload.findMany({
    where: {
      userId,
      ...(conversationId
        ? {
            OR: [
              { conversationId, messageId: null },
              {
                conversationReferences: {
                  some: { conversationId, messageId: null }
                }
              }
            ]
          }
        : {
            conversationId: null,
            conversationDraft: {
              is: { userId }
            }
          })
    },
    orderBy: { createdAt: 'desc' }
  })

  return records.map(formatFileRecord)
}

export async function detachFile(
  userId: string,
  fileId: string,
  options: { conversationId?: string; conversationDraft?: boolean }
) {
  await detachComposerFile(userId, fileId, options)
}

export async function canUserAccessStorageKey(userId: string, storageKey: string) {
  const [file, knowledgeBase] = await Promise.all([
    prisma.fileUpload.findFirst({
      where: {
        userId,
        storageKey
      },
      select: { id: true }
    }),
    prisma.knowledgeBase.findFirst({
      where: {
        userId,
        storageKey
      },
      select: { id: true }
    })
  ])

  if (file || knowledgeBase) {
    return true
  }

  const [messageAccess] = await prisma.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "Message" m
        INNER JOIN "Conversation" c ON c.id = m."conversationId"
        WHERE c."userId" = ${userId}
          AND m."fileList" IS NOT NULL
          AND m."fileList"::jsonb @> ${JSON.stringify([{ storageKey }])}::jsonb
      ) AS "exists"
    `
  )

  return Boolean(messageAccess?.exists)
}
