import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import mammoth from 'mammoth'
import type { Express } from 'express'

import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { chunkText } from '../../lib/chunker'
import { AppError } from '../../utils/app-error'
import { deleteObject, formUpload, getObjectBuffer } from '../../utils/obs'
import type {
  CreateKnowledgeBaseBody,
  InviteKnowledgeBaseMembersBody,
  UpdateKnowledgeBaseBody,
  UpdateKnowledgeBaseVisibilityBody
} from './knowledge-base.schema'
import { processKnowledgeBaseForRag, searchKnowledgeBaseChunks } from './knowledge-base-rag.service'

const LOCAL_KNOWLEDGE_BASE_DIR = path.resolve(process.cwd(), 'uploads/knowledge-bases')
const MAX_DOCX_SIZE = 20 * 1024 * 1024
const MAX_TXT_SIZE = 20 * 1024 * 1024
const LEGACY_MAX_INDEXING_CONTENT_LENGTH = 120000
const MAX_INDEXING_CONTENT_LENGTH = 2_000_000

type FormattedKnowledgeBase = ReturnType<typeof formatKnowledgeBaseRecord>

function ensureLocalKnowledgeBaseDir() {
  if (!fs.existsSync(LOCAL_KNOWLEDGE_BASE_DIR)) {
    fs.mkdirSync(LOCAL_KNOWLEDGE_BASE_DIR, { recursive: true })
  }
}

function sanitizeObjectKey(originalName: string) {
  return `knowledge-bases/${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

function isTxtFile(file: Express.Multer.File, originalName: string) {
  return file.mimetype.startsWith('text/') || originalName.toLowerCase().endsWith('.txt')
}

function isDocxFile(file: Express.Multer.File, originalName: string) {
  return (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    originalName.toLowerCase().endsWith('.docx')
  )
}

function trimIndexingContent(content: string) {
  return content.slice(0, MAX_INDEXING_CONTENT_LENGTH)
}

async function extractAttachmentTextFromBuffer(
  buffer: Buffer,
  originalName: string,
  mimeType?: string | null
) {
  const lowerName = originalName.toLowerCase()

  if (mimeType?.startsWith('text/') || lowerName.endsWith('.txt')) {
    return trimIndexingContent(buffer.toString('utf8'))
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return trimIndexingContent(result.value || '')
  }

  throw new AppError(400, '知识库附件仅支持 txt 或 docx 文件', 'KNOWLEDGE_BASE_FILE_UNSUPPORTED')
}

async function extractAttachmentText(file: Express.Multer.File, originalName: string) {
  if (isTxtFile(file, originalName)) {
    if (file.size > MAX_TXT_SIZE) {
      throw new AppError(400, 'TXT 附件不能超过 20MB', 'KNOWLEDGE_BASE_FILE_TOO_LARGE')
    }

    return extractAttachmentTextFromBuffer(fs.readFileSync(file.path), originalName, file.mimetype)
  }

  if (isDocxFile(file, originalName)) {
    if (file.size > MAX_DOCX_SIZE) {
      throw new AppError(400, 'Word 附件不能超过 20MB', 'KNOWLEDGE_BASE_FILE_TOO_LARGE')
    }

    return extractAttachmentTextFromBuffer(fs.readFileSync(file.path), originalName, file.mimetype)
  }

  throw new AppError(400, '知识库附件仅支持 txt 或 docx 文件', 'KNOWLEDGE_BASE_FILE_UNSUPPORTED')
}

function buildIndexingContent(input: {
  title: string
  content: string
  attachmentText?: string | null
  attachmentName?: string | null
}) {
  const parts = [`标题：${input.title}`, `介绍：${input.content}`]

  if (input.attachmentText?.trim()) {
    parts.push(`附件：${input.attachmentName || '未命名附件'}`)
    parts.push(input.attachmentText.trim())
  }

  return trimIndexingContent(parts.join('\n\n'))
}

function formatKnowledgeBaseRecord(
  record: {
    id: string
    userId: string
    title: string
    content: string
    attachmentName: string | null
    attachmentMimeType: string | null
    attachmentSize: number | null
    storageKey: string | null
    visibility: string
    processingStatus: string
    processingError: string | null
    createdAt: Date
    updatedAt: Date
    user?: {
      id: string
      username: string
      email: string
    }
    _count?: {
      members?: number
    }
  },
  currentUserId?: string
) {
  return {
    id: record.id,
    ownerId: record.userId,
    owner: record.user
      ? {
          id: record.user.id,
          username: record.user.username,
          email: record.user.email
        }
      : undefined,
    role: record.userId === currentUserId ? 'owner' : 'member',
    title: record.title,
    content: record.content,
    attachmentName: record.attachmentName,
    attachmentMimeType: record.attachmentMimeType,
    attachmentSize: record.attachmentSize,
    storageKey: record.storageKey,
    visibility: record.visibility,
    memberCount: record._count?.members ?? 0,
    processingStatus: record.processingStatus,
    processingError: record.processingError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

function getLocalStoredFilePath(storageKey: string) {
  return path.resolve(LOCAL_KNOWLEDGE_BASE_DIR, storageKey.replace(/\//g, '_'))
}

async function readStoredKnowledgeBaseFileBuffer(storageKey: string) {
  if (env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY) {
    return getObjectBuffer(storageKey)
  }

  const localPath = getLocalStoredFilePath(storageKey)
  if (!fs.existsSync(localPath)) {
    return null
  }

  return fs.readFileSync(localPath)
}

async function deleteStoredFile(storageKey: string) {
  if (env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY) {
    await deleteObject(storageKey)
    return
  }

  const localPath = getLocalStoredFilePath(storageKey)
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath)
  }
}

function scheduleKnowledgeBaseProcessing(knowledgeBaseId: string) {
  void processKnowledgeBaseForRag(knowledgeBaseId).catch((error) => {
    console.error('知识库异步处理失败:', error)
  })
}

function extractStoredAttachmentText(
  indexingContent: string | null,
  attachmentName: string | null
) {
  if (!indexingContent?.trim() || !attachmentName) {
    return null
  }

  const marker = `附件：${attachmentName}`
  const markerIndex = indexingContent.indexOf(marker)

  if (markerIndex < 0) {
    return null
  }

  return indexingContent.slice(markerIndex + marker.length).trim() || null
}

async function restoreLegacyTruncatedIndexingContent(record: {
  id: string
  title: string
  content: string
  indexingContent: string | null
  attachmentName: string | null
  attachmentMimeType: string | null
  attachmentSize: number | null
  storageKey: string | null
}) {
  const currentContent = record.indexingContent?.trim() || ''
  const looksLegacyTruncated =
    currentContent.length >= LEGACY_MAX_INDEXING_CONTENT_LENGTH - 200 &&
    currentContent.length < MAX_INDEXING_CONTENT_LENGTH

  if (!looksLegacyTruncated || !record.storageKey || !record.attachmentName) {
    return currentContent
  }

  if (record.attachmentSize && record.attachmentSize > MAX_DOCX_SIZE) {
    return currentContent
  }

  try {
    const buffer = await readStoredKnowledgeBaseFileBuffer(record.storageKey)
    if (!buffer) {
      return currentContent
    }

    const attachmentText = await extractAttachmentTextFromBuffer(
      buffer,
      record.attachmentName,
      record.attachmentMimeType
    )
    const nextContent = buildIndexingContent({
      title: record.title,
      content: record.content,
      attachmentText,
      attachmentName: record.attachmentName
    })

    if (nextContent.length <= currentContent.length) {
      return currentContent
    }

    await prisma.knowledgeBase.update({
      where: { id: record.id },
      data: {
        indexingContent: nextContent,
        processingError: null
      }
    })

    void processKnowledgeBaseForRag(record.id, { preserveCompletedStatus: true }).catch((error) => {
      console.error('知识库旧截断索引重建失败:', error)
    })

    return nextContent
  } catch (error) {
    console.error('知识库旧截断内容恢复失败:', error)
    return currentContent
  }
}

function shouldRefreshSparseKnowledgeBaseIndex(sourceText: string, chunkCount: number) {
  if (sourceText.length <= 2400) {
    return false
  }

  const expectedMinimum = Math.min(3, Math.ceil(sourceText.length / 900))
  return chunkCount < expectedMinimum
}

function buildLocalKnowledgeBaseFallbackChunks(
  sourceText: string,
  query: string,
  limit: number,
  existingContents: string[],
  options: { requirePositiveScore?: boolean } = {}
) {
  if (limit <= 0 || !sourceText.trim()) {
    return []
  }

  const existingContentSet = new Set(existingContents.map((content) => content.trim()))
  const terms = tokenizeKnowledgeBaseQuery(query)
  const chunks = chunkText(sourceText, 500, 80)
    .filter((content) => !existingContentSet.has(content.trim()))
    .map((content, index) => ({
      content,
      score: scoreKnowledgeBaseChunk(content, terms),
      index
    }))
    .filter((chunk) => !options.requirePositiveScore || chunk.score > 0)

  if (!chunks.length) {
    return []
  }

  return chunks
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((chunk) => chunk.content)
}

function tokenizeKnowledgeBaseQuery(query: string) {
  const terms = new Set<string>()
  const normalized = query.toLowerCase()

  for (const term of normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []) {
    terms.add(term)
  }

  for (const sequence of query.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    const cleaned = sequence.replace(
      /(指的是谁|指的是|是谁|是什么|叫什么|什么意思|谁|什么|吗|呢)$/u,
      ''
    )
    const keyword = cleaned.length >= 2 ? cleaned : sequence

    terms.add(keyword)

    if (keyword.length > 2) {
      for (let index = 0; index < keyword.length - 1; index += 1) {
        terms.add(keyword.slice(index, index + 2))
      }
    }
  }

  return [...terms].slice(0, 40)
}

function scoreKnowledgeBaseChunk(content: string, terms: string[]) {
  if (!terms.length) {
    return 0
  }

  const normalized = content.toLowerCase()
  return terms.reduce((score, term) => {
    return normalized.includes(term.toLowerCase()) ? score + term.length : score
  }, 0)
}

export async function listKnowledgeBases(userId: string) {
  const records = await prisma.knowledgeBase.findMany({
    where: {
      OR: [
        { userId },
        {
          visibility: 'team',
          members: {
            some: { userId }
          }
        }
      ]
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      userId: true,
      title: true,
      content: true,
      attachmentName: true,
      attachmentMimeType: true,
      attachmentSize: true,
      storageKey: true,
      visibility: true,
      processingStatus: true,
      processingError: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, username: true, email: true }
      },
      _count: {
        select: { members: true }
      }
    }
  })

  return {
    knowledgeBases: records.map((record) => formatKnowledgeBaseRecord(record, userId))
  }
}

export async function ensureAccessibleKnowledgeBase(
  userId: string,
  knowledgeBaseId?: string | null
) {
  if (!knowledgeBaseId) {
    return null
  }

  const knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: {
      id: knowledgeBaseId,
      OR: [
        { userId },
        {
          visibility: 'team',
          members: {
            some: { userId }
          }
        }
      ]
    },
    select: {
      id: true,
      processingStatus: true
    }
  })

  if (!knowledgeBase) {
    throw new AppError(
      404,
      '该知识库已不可用，可能已被设为私有或你已被移出团队，请刷新页面后重新选择知识库',
      'KNOWLEDGE_BASE_NOT_ACCESSIBLE'
    )
  }

  if (knowledgeBase.processingStatus !== 'completed') {
    throw new AppError(400, '该知识库暂不可用', 'KNOWLEDGE_BASE_NOT_READY')
  }

  return knowledgeBase.id
}

async function ensureKnowledgeBaseOwner(userId: string, knowledgeBaseId: string) {
  const record = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId }
  })

  if (!record) {
    throw new AppError(404, '知识库不存在', 'KNOWLEDGE_BASE_NOT_FOUND')
  }

  if (record.userId !== userId) {
    throw new AppError(403, '只有知识库创建者可以执行该操作', 'FORBIDDEN')
  }

  return record
}

export async function createKnowledgeBase(
  userId: string,
  data: CreateKnowledgeBaseBody,
  file?: Express.Multer.File
) {
  const title = data.title.trim()
  const content = data.content.trim()
  const originalName = file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : undefined
  const attachmentText = file ? await extractAttachmentText(file, originalName!) : null

  let storageKey: string | null = null

  if (file) {
    if (env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY) {
      const uploaded = await formUpload(file.path, originalName!)
      storageKey = uploaded.key
      fs.unlink(file.path, () => {})
    } else {
      ensureLocalKnowledgeBaseDir()
      storageKey = sanitizeObjectKey(originalName!)
      const localPath = getLocalStoredFilePath(storageKey)
      fs.renameSync(file.path, localPath)
    }
  }

  const indexingContent = buildIndexingContent({
    title,
    content,
    attachmentText,
    attachmentName: originalName ?? null
  })

  const record = await prisma.knowledgeBase.create({
    data: {
      userId,
      title,
      content,
      attachmentName: originalName ?? null,
      attachmentMimeType: file?.mimetype ?? null,
      attachmentSize: file?.size ?? null,
      storageKey,
      storageUrl: '',
      indexingContent,
      visibility: data.visibility ?? 'private',
      processingStatus: 'queued'
    }
  })

  scheduleKnowledgeBaseProcessing(record.id)

  return formatKnowledgeBaseRecord(record, userId)
}

export async function updateKnowledgeBase(
  userId: string,
  knowledgeBaseId: string,
  data: UpdateKnowledgeBaseBody,
  file?: Express.Multer.File
) {
  const current = await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  const title = data.title.trim()
  const content = data.content.trim()
  const originalName = file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : undefined
  const attachmentText = file
    ? await extractAttachmentText(file, originalName!)
    : extractStoredAttachmentText(current.indexingContent, current.attachmentName)

  let nextStorageKey = current.storageKey
  let uploadedStorageKey: string | null = null

  if (file) {
    if (env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY) {
      const uploaded = await formUpload(file.path, originalName!)
      nextStorageKey = uploaded.key
      uploadedStorageKey = uploaded.key
      fs.unlink(file.path, () => {})
    } else {
      ensureLocalKnowledgeBaseDir()
      nextStorageKey = sanitizeObjectKey(originalName!)
      const localPath = getLocalStoredFilePath(nextStorageKey)
      fs.renameSync(file.path, localPath)
      uploadedStorageKey = nextStorageKey
    }
  }

  const indexingContent = buildIndexingContent({
    title,
    content,
    attachmentText,
    attachmentName: file ? originalName! : current.attachmentName
  })
  const shouldReprocess =
    current.indexingContent !== indexingContent || current.processingStatus === 'failed'

  try {
    const record = await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        title,
        content,
        attachmentName: file ? originalName! : current.attachmentName,
        attachmentMimeType: file ? file.mimetype : current.attachmentMimeType,
        attachmentSize: file ? file.size : current.attachmentSize,
        storageKey: nextStorageKey,
        storageUrl: '',
        indexingContent,
        visibility: data.visibility ?? current.visibility,
        processingStatus: shouldReprocess ? 'queued' : current.processingStatus,
        processingError: shouldReprocess ? null : current.processingError
      }
    })

    if ((data.visibility ?? current.visibility) === 'private' && current.visibility !== 'private') {
      const members = await prisma.knowledgeBaseMember.findMany({
        where: { knowledgeBaseId },
        select: { userId: true }
      })
      const memberUserIds = members.map((member) => member.userId)

      await prisma.$transaction([
        prisma.conversation.updateMany({
          where: {
            knowledgeBaseId,
            userId: { in: memberUserIds }
          },
          data: { knowledgeBaseId: null }
        }),
        prisma.knowledgeBaseMember.deleteMany({ where: { knowledgeBaseId } }),
        prisma.knowledgeBaseInvitation.deleteMany({ where: { knowledgeBaseId } })
      ])
    }

    if (file && current.storageKey && current.storageKey !== nextStorageKey) {
      deleteStoredFile(current.storageKey).catch((error) => {
        console.error('删除旧知识库附件失败:', error)
      })
    }

    if (shouldReprocess) {
      scheduleKnowledgeBaseProcessing(record.id)
    }

    return formatKnowledgeBaseRecord(record, userId)
  } catch (error) {
    if (uploadedStorageKey) {
      deleteStoredFile(uploadedStorageKey).catch((cleanupError) => {
        console.error('清理新知识库附件失败:', cleanupError)
      })
    }

    throw error
  }
}

export async function deleteKnowledgeBase(userId: string, knowledgeBaseId: string) {
  const record = await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  if (record.storageKey) {
    try {
      await deleteStoredFile(record.storageKey)
    } catch (error) {
      console.error('删除知识库附件失败:', error)
    }
  }

  await prisma.knowledgeBase.delete({
    where: { id: knowledgeBaseId }
  })
}

export async function updateKnowledgeBaseVisibility(
  userId: string,
  knowledgeBaseId: string,
  data: UpdateKnowledgeBaseVisibilityBody
) {
  await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  const record = await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: { visibility: data.visibility },
    include: {
      user: {
        select: { id: true, username: true, email: true }
      },
      _count: {
        select: { members: true }
      }
    }
  })

  if (data.visibility === 'private') {
    const members = await prisma.knowledgeBaseMember.findMany({
      where: { knowledgeBaseId },
      select: { userId: true }
    })
    const memberUserIds = members.map((member) => member.userId)

    await prisma.$transaction([
      prisma.conversation.updateMany({
        where: {
          knowledgeBaseId,
          userId: { in: memberUserIds }
        },
        data: { knowledgeBaseId: null }
      }),
      prisma.knowledgeBaseMember.deleteMany({ where: { knowledgeBaseId } }),
      prisma.knowledgeBaseInvitation.deleteMany({ where: { knowledgeBaseId } })
    ])
  }

  return formatKnowledgeBaseRecord(record, userId)
}

export async function listKnowledgeBaseMembers(userId: string, knowledgeBaseId: string) {
  await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  const members = await prisma.knowledgeBaseMember.findMany({
    where: { knowledgeBaseId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: { id: true, username: true, email: true }
      }
    }
  })

  return {
    members: members.map((member) => ({
      id: member.user.id,
      username: member.user.username,
      email: member.user.email,
      joinedAt: member.createdAt
    }))
  }
}

export async function inviteKnowledgeBaseMembers(
  userId: string,
  knowledgeBaseId: string,
  data: InviteKnowledgeBaseMembersBody
) {
  const record = await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  if (record.visibility !== 'team') {
    throw new AppError(400, '只有团队知识库可以邀请成员', 'KNOWLEDGE_BASE_NOT_TEAM')
  }

  const targetUserIds = Array.from(new Set(data.userIds)).filter((id) => id !== userId)

  if (targetUserIds.length === 0) {
    throw new AppError(400, '请选择要邀请的用户', 'VALIDATION_ERROR')
  }

  const users = await prisma.user.findMany({
    where: { id: { in: targetUserIds }, type: 'registered' },
    select: { id: true }
  })
  const existingMembers = await prisma.knowledgeBaseMember.findMany({
    where: {
      knowledgeBaseId,
      userId: { in: targetUserIds }
    },
    select: { userId: true }
  })
  const memberIds = new Set(existingMembers.map((member) => member.userId))
  const inviteCandidateIds = users.map((user) => user.id).filter((id) => !memberIds.has(id))

  const existingInvitations = inviteCandidateIds.length
    ? await prisma.knowledgeBaseInvitation.findMany({
        where: {
          knowledgeBaseId,
          inviteeId: { in: inviteCandidateIds }
        },
        select: { inviteeId: true }
      })
    : []
  const invitationIds = new Set(existingInvitations.map((invitation) => invitation.inviteeId))
  const validUserIds = inviteCandidateIds.filter((id) => !invitationIds.has(id))

  if (validUserIds.length === 0) {
    return {
      createdCount: 0,
      skippedMemberCount: memberIds.size,
      skippedInvitationCount: invitationIds.size
    }
  }

  const result = await prisma.knowledgeBaseInvitation.createMany({
    data: validUserIds.map((inviteeId) => ({
      id: randomUUID(),
      knowledgeBaseId,
      inviterId: userId,
      inviteeId
    })),
    skipDuplicates: true
  })

  return {
    createdCount: result.count,
    skippedMemberCount: memberIds.size,
    skippedInvitationCount: invitationIds.size + validUserIds.length - result.count
  }
}

export async function removeKnowledgeBaseMember(
  userId: string,
  knowledgeBaseId: string,
  memberUserId: string
) {
  await ensureKnowledgeBaseOwner(userId, knowledgeBaseId)

  await prisma.$transaction([
    prisma.knowledgeBaseMember.deleteMany({
      where: {
        knowledgeBaseId,
        userId: memberUserId
      }
    }),
    prisma.conversation.updateMany({
      where: {
        userId: memberUserId,
        knowledgeBaseId
      },
      data: { knowledgeBaseId: null }
    })
  ])
}

export async function leaveKnowledgeBase(userId: string, knowledgeBaseId: string) {
  const member = await prisma.knowledgeBaseMember.findUnique({
    where: {
      knowledgeBaseId_userId: {
        knowledgeBaseId,
        userId
      }
    }
  })

  if (!member) {
    throw new AppError(404, '团队知识库不存在', 'KNOWLEDGE_BASE_NOT_FOUND')
  }

  await prisma.$transaction([
    prisma.knowledgeBaseMember.delete({
      where: { id: member.id }
    }),
    prisma.conversation.updateMany({
      where: {
        userId,
        knowledgeBaseId
      },
      data: { knowledgeBaseId: null }
    })
  ])
}

export async function listKnowledgeBaseInvitations(userId: string) {
  const invitations = await prisma.knowledgeBaseInvitation.findMany({
    where: { inviteeId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      inviter: {
        select: { id: true, username: true, email: true }
      },
      knowledgeBase: {
        select: { id: true, title: true, visibility: true }
      }
    }
  })

  return {
    invitations: invitations
      .filter((invitation) => invitation.knowledgeBase.visibility === 'team')
      .map((invitation) => ({
        id: invitation.id,
        createdAt: invitation.createdAt,
        inviter: invitation.inviter,
        knowledgeBase: {
          id: invitation.knowledgeBase.id,
          title: invitation.knowledgeBase.title
        }
      }))
  }
}

export async function acceptKnowledgeBaseInvitation(userId: string, invitationId: string) {
  const invitation = await prisma.knowledgeBaseInvitation.findFirst({
    where: {
      id: invitationId,
      inviteeId: userId
    },
    include: {
      knowledgeBase: {
        select: { id: true, visibility: true }
      }
    }
  })

  if (!invitation) {
    throw new AppError(404, '邀请不存在', 'INVITATION_NOT_FOUND')
  }

  if (invitation.knowledgeBase.visibility !== 'team') {
    await prisma.knowledgeBaseInvitation.delete({ where: { id: invitation.id } })
    throw new AppError(400, '该知识库已不再开放团队邀请', 'KNOWLEDGE_BASE_NOT_TEAM')
  }

  await prisma.$transaction([
    prisma.knowledgeBaseMember.upsert({
      where: {
        knowledgeBaseId_userId: {
          knowledgeBaseId: invitation.knowledgeBaseId,
          userId
        }
      },
      update: {},
      create: {
        knowledgeBaseId: invitation.knowledgeBaseId,
        userId
      }
    }),
    prisma.knowledgeBaseInvitation.delete({ where: { id: invitation.id } })
  ])
}

export async function rejectKnowledgeBaseInvitation(userId: string, invitationId: string) {
  const invitation = await prisma.knowledgeBaseInvitation.findFirst({
    where: {
      id: invitationId,
      inviteeId: userId
    },
    select: { id: true }
  })

  if (!invitation) {
    throw new AppError(404, '邀请不存在', 'INVITATION_NOT_FOUND')
  }

  await prisma.knowledgeBaseInvitation.delete({ where: { id: invitation.id } })
}

export async function buildKnowledgeBaseContext(
  userId: string,
  knowledgeBaseId: string | undefined,
  latestUserMessage: string
): Promise<{ knowledgeBaseId: string; context: string } | null> {
  if (!knowledgeBaseId) {
    return null
  }

  const knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: {
      id: knowledgeBaseId,
      OR: [
        { userId },
        {
          visibility: 'team',
          members: {
            some: { userId }
          }
        }
      ]
    },
    select: {
      id: true,
      userId: true,
      title: true,
      content: true,
      indexingContent: true,
      attachmentName: true,
      attachmentMimeType: true,
      attachmentSize: true,
      storageKey: true,
      processingStatus: true,
      processingError: true
    }
  })

  if (!knowledgeBase) {
    throw new AppError(
      404,
      '该知识库已不可用，可能已被设为私有或你已被移出团队，请刷新页面后重新选择知识库',
      'KNOWLEDGE_BASE_NOT_ACCESSIBLE'
    )
  }

  if (knowledgeBase.processingStatus !== 'completed') {
    throw new AppError(
      400,
      knowledgeBase.processingStatus === 'failed'
        ? `知识库处理失败：${knowledgeBase.processingError || '请删除后重新创建'}`
        : '该知识库仍在处理中，暂不可用于对话',
      'KNOWLEDGE_BASE_NOT_READY'
    )
  }

  const sourceText = await restoreLegacyTruncatedIndexingContent(knowledgeBase)
  const accessRole = knowledgeBase.userId === userId ? 'owner' : 'member'
  const parts = [
    `当前对话选择了知识库「${knowledgeBase.title}」。`,
    `知识库介绍：${knowledgeBase.content}`
  ]

  if (knowledgeBase.attachmentName) {
    parts.push(`附件名称：${knowledgeBase.attachmentName}`)
  }

  if (sourceText && sourceText.length <= 2400) {
    parts.push(`以下是知识库全文，请优先基于这些内容回答：\n${sourceText}`)
    const context = parts.join('\n\n')

    return {
      knowledgeBaseId: knowledgeBase.id,
      context
    }
  }

  const retrievalQuery =
    latestUserMessage.trim() || `${knowledgeBase.title}\n${knowledgeBase.content}`

  const chunkCount = await prisma.knowledgeBaseChunk.count({
    where: { knowledgeBaseId: knowledgeBase.id }
  })

  if (shouldRefreshSparseKnowledgeBaseIndex(sourceText, chunkCount)) {
    void processKnowledgeBaseForRag(knowledgeBase.id, { preserveCompletedStatus: true }).catch(
      (error) => {
        console.error('知识库稀疏索引重建失败:', error)
      }
    )
  }

  const chunks = await searchKnowledgeBaseChunks(knowledgeBase.id, retrievalQuery, 6)
  const lexicalFallbackChunks = buildLocalKnowledgeBaseFallbackChunks(
    sourceText,
    retrievalQuery,
    2,
    chunks.map((chunk) => chunk.content),
    { requirePositiveScore: true }
  )
  const completionFallbackChunks =
    chunks.length + lexicalFallbackChunks.length < 4
      ? buildLocalKnowledgeBaseFallbackChunks(
          sourceText,
          retrievalQuery,
          4 - chunks.length - lexicalFallbackChunks.length,
          [...chunks.map((chunk) => chunk.content), ...lexicalFallbackChunks]
        )
      : []
  const fallbackChunks = [...lexicalFallbackChunks, ...completionFallbackChunks]

  if (chunks.length > 0 || fallbackChunks.length > 0) {
    parts.push(
      [
        '以下是从知识库检索到的相关片段，请优先基于这些内容回答；如果证据不足，要明确说明：',
        ...chunks.map(
          (chunk, index) =>
            `片段 ${index + 1}（相似度 ${(chunk.similarity * 100).toFixed(0)}%）：\n${chunk.content}`
        ),
        ...fallbackChunks.map(
          (content, index) => `补充片段 ${index + 1}（本地关键词匹配）：\n${content}`
        )
      ].join('\n\n')
    )
  } else if (sourceText) {
    parts.push(
      `未检索到高相关片段，以下是知识库摘要内容，可作为辅助参考：\n${sourceText.slice(0, 2400)}`
    )
  }

  const context = parts.join('\n\n')

  return {
    knowledgeBaseId: knowledgeBase.id,
    context
  }
}

export type KnowledgeBaseRecord = FormattedKnowledgeBase
