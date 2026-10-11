import { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import { deleteObject } from '../../utils/obs'
import { attachFileToConversationDraft } from '../conversation-drafts/conversation-draft.service'
import { attachPendingFileReference } from '../files/file-reference.service'

export const libraryAssetCategories = [
  'user_file',
  'user_image',
  'generated_image',
  'knowledge_base_attachment'
] as const

export type LibraryAssetCategory = (typeof libraryAssetCategories)[number]

export type LibraryAssetRef = {
  category: LibraryAssetCategory
  sourceId: string
  storageKey: string
}

export type DeleteReferenceState = {
  hasActiveDraft: boolean
  hasActiveConversation: boolean
  hasActiveMessage: boolean
  hasActiveKnowledgeBase: boolean
}

export type LibraryAsset = {
  id: string
  fileName: string
  size: number
  category: LibraryAssetCategory
  categoryLabel: string
  storageKey: string
  conversationId: string | null
  conversationTitle: string | null
  conversationReferenceType: 'conversation' | 'draft' | null
  conversationReferences: LibraryAssetConversationReference[]
  createdAt: Date
  downloadable: boolean
  deletable: boolean
  deleteBlockedReason: string | null
}

export type LibraryAssetConversationReference = {
  conversationId: string | null
  conversationTitle: string
  type: 'conversation' | 'draft'
}

type GeneratedImageRow = {
  messageId: string
  conversationId: string
  conversationTitle: string
  storageKey: string
  size: number | null
  createdAt: Date
}

const categoryLabelMap: Record<LibraryAssetCategory, string> = {
  user_file: '用户上传文件',
  user_image: '用户上传图片',
  generated_image: '文生图',
  knowledge_base_attachment: '知识库附件'
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function isLibraryAssetCategory(value: unknown): value is LibraryAssetCategory {
  return libraryAssetCategories.includes(value as LibraryAssetCategory)
}

export function buildAssetId(ref: LibraryAssetRef) {
  return toBase64Url(JSON.stringify(ref))
}

export function decodeAssetId(assetId: string): LibraryAssetRef {
  try {
    const parsed = JSON.parse(fromBase64Url(assetId)) as Partial<LibraryAssetRef>

    if (
      !isLibraryAssetCategory(parsed.category) ||
      typeof parsed.sourceId !== 'string' ||
      !parsed.sourceId ||
      typeof parsed.storageKey !== 'string' ||
      !parsed.storageKey
    ) {
      throw new Error('invalid asset id')
    }

    return {
      category: parsed.category,
      sourceId: parsed.sourceId,
      storageKey: parsed.storageKey
    }
  } catch {
    throw new AppError(400, '资料标识无效', 'INVALID_LIBRARY_ASSET_ID')
  }
}

export function getAssetCategoryLabel(category: LibraryAssetCategory) {
  return categoryLabelMap[category]
}

export function getDeleteBlockedReason(state: DeleteReferenceState) {
  if (state.hasActiveDraft) {
    return '资料正在被新建会话引用，不能删除'
  }

  if (state.hasActiveConversation) {
    return '资料仍被存在的对话引用，不能删除'
  }

  if (state.hasActiveMessage) {
    return '资料仍被存在的消息引用，不能删除'
  }

  if (state.hasActiveKnowledgeBase) {
    return '资料仍被存在的知识库引用，不能删除'
  }

  return null
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function getGeneratedImageFileName(createdAt: Date) {
  const year = createdAt.getUTCFullYear()
  const month = padDatePart(createdAt.getUTCMonth() + 1)
  const day = padDatePart(createdAt.getUTCDate())
  const hour = padDatePart(createdAt.getUTCHours())
  const minute = padDatePart(createdAt.getUTCMinutes())
  return `AI生成图片-${year}${month}${day}-${hour}${minute}.png`
}

function buildAsset(params: {
  category: LibraryAssetCategory
  sourceId: string
  storageKey: string
  fileName: string
  size?: number | null
  conversationId?: string | null
  conversationTitle?: string | null
  conversationReferenceType?: 'conversation' | 'draft' | null
  conversationReferences?: LibraryAssetConversationReference[]
  createdAt: Date
  referenceState: DeleteReferenceState
}): LibraryAsset {
  const deleteBlockedReason = getDeleteBlockedReason(params.referenceState)
  const conversationReferences = params.conversationReferences ?? []
  const primaryReference = conversationReferences[0]

  return {
    id: buildAssetId({
      category: params.category,
      sourceId: params.sourceId,
      storageKey: params.storageKey
    }),
    fileName: params.fileName || '未命名资料',
    size: params.size ?? 0,
    category: params.category,
    categoryLabel: getAssetCategoryLabel(params.category),
    storageKey: params.storageKey,
    conversationId: params.conversationId ?? primaryReference?.conversationId ?? null,
    conversationTitle: params.conversationTitle ?? primaryReference?.conversationTitle ?? null,
    conversationReferenceType: params.conversationReferenceType ?? primaryReference?.type ?? null,
    conversationReferences,
    createdAt: params.createdAt,
    downloadable: true,
    deletable: !deleteBlockedReason,
    deleteBlockedReason
  }
}

function uniqueConversationReferences(
  references: LibraryAssetConversationReference[]
): LibraryAssetConversationReference[] {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.type}:${reference.conversationId ?? 'draft'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function listGeneratedImageAssets(userId: string): Promise<LibraryAsset[]> {
  const rows = await prisma.$queryRaw<GeneratedImageRow[]>(
    Prisma.sql`
      SELECT
        m.id AS "messageId",
        c.id AS "conversationId",
        c.title AS "conversationTitle",
        file_item->>'storageKey' AS "storageKey",
        CASE
          WHEN file_item->>'size' ~ '^[0-9]+$' THEN (file_item->>'size')::int
          ELSE 0
        END AS "size",
        m."createdAt" AS "createdAt"
      FROM "Message" m
      INNER JOIN "Conversation" c ON c.id = m."conversationId"
      CROSS JOIN LATERAL jsonb_array_elements(m."fileList"::jsonb) AS file_item
      WHERE c."userId" = ${userId}
        AND m.role = 'assistant'
        AND m.type = 'image'
        AND m."fileList" IS NOT NULL
        AND file_item->>'kind' = 'image'
        AND COALESCE(file_item->>'storageKey', '') <> ''
      ORDER BY m."createdAt" DESC
    `
  )

  return rows.map((row) =>
    buildAsset({
      category: 'generated_image',
      sourceId: row.messageId,
      storageKey: row.storageKey,
      fileName: getGeneratedImageFileName(row.createdAt),
      size: row.size ?? 0,
      conversationId: row.conversationId,
      conversationTitle: row.conversationTitle,
      conversationReferenceType: 'conversation',
      conversationReferences: [
        {
          conversationId: row.conversationId,
          conversationTitle: row.conversationTitle,
          type: 'conversation'
        }
      ],
      createdAt: row.createdAt,
      referenceState: {
        hasActiveDraft: false,
        hasActiveConversation: false,
        hasActiveMessage: true,
        hasActiveKnowledgeBase: false
      }
    })
  )
}

export async function listLibraryAssets(userId: string): Promise<LibraryAsset[]> {
  const [uploads, knowledgeBases, generatedImages] = await Promise.all([
    prisma.fileUpload.findMany({
      where: { userId },
      select: {
        id: true,
        originalName: true,
        size: true,
        storageKey: true,
        kind: true,
        source: true,
        createdAt: true,
        conversation: { select: { id: true, title: true } },
        message: { select: { id: true } },
        conversationDraft: { select: { id: true } },
        conversationReferences: {
          select: {
            messageId: true,
            conversation: { select: { id: true, title: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.knowledgeBase.findMany({
      where: {
        userId,
        storageKey: { not: null }
      },
      select: {
        id: true,
        attachmentName: true,
        attachmentSize: true,
        storageKey: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    listGeneratedImageAssets(userId)
  ])

  const uploadAssets = uploads.map((file) => {
    const conversationReferences = uniqueConversationReferences([
      ...(file.conversation
        ? [
            {
              conversationId: file.conversation.id,
              conversationTitle: file.conversation.title,
              type: 'conversation' as const
            }
          ]
        : []),
      ...file.conversationReferences.map((reference) => ({
        conversationId: reference.conversation.id,
        conversationTitle: reference.conversation.title,
        type: 'conversation' as const
      })),
      ...(file.conversationDraft
        ? [
            {
              conversationId: null,
              conversationTitle: '新建会话',
              type: 'draft' as const
            }
          ]
        : [])
    ])

    return buildAsset({
      category:
        file.source === 'generated'
          ? 'generated_image'
          : file.kind === 'image'
            ? 'user_image'
            : 'user_file',
      sourceId: file.id,
      storageKey: file.storageKey,
      fileName: file.originalName,
      size: file.size,
      conversationReferences,
      createdAt: file.createdAt,
      referenceState: {
        hasActiveDraft: Boolean(file.conversationDraft),
        hasActiveConversation: conversationReferences.some(
          (reference) => reference.type === 'conversation'
        ),
        hasActiveMessage:
          Boolean(file.message) ||
          file.conversationReferences.some((reference) => Boolean(reference.messageId)),
        hasActiveKnowledgeBase: false
      }
    })
  })

  const knowledgeBaseAssets = knowledgeBases
    .filter((item): item is typeof item & { storageKey: string } => Boolean(item.storageKey))
    .map((item) =>
      buildAsset({
        category: 'knowledge_base_attachment',
        sourceId: item.id,
        storageKey: item.storageKey,
        fileName: item.attachmentName || '知识库附件',
        size: item.attachmentSize ?? 0,
        createdAt: item.createdAt,
        referenceState: {
          hasActiveDraft: false,
          hasActiveConversation: false,
          hasActiveMessage: false,
          hasActiveKnowledgeBase: true
        }
      })
    )

  const materializedStorageKeys = new Set(uploads.map((file) => file.storageKey))
  const unmaterializedGeneratedImages = generatedImages.filter(
    (asset) => !materializedStorageKeys.has(asset.storageKey)
  )

  return [...uploadAssets, ...unmaterializedGeneratedImages, ...knowledgeBaseAssets].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
}

async function assertAssetSourceBelongsToUser(userId: string, ref: LibraryAssetRef) {
  if (ref.category === 'user_file' || ref.category === 'user_image') {
    const expectedKind = ref.category === 'user_image' ? 'image' : 'file'
    const file = await prisma.fileUpload.findFirst({
      where: {
        id: ref.sourceId,
        userId,
        storageKey: ref.storageKey,
        kind: expectedKind
      },
      select: { id: true }
    })

    if (!file) {
      throw new AppError(404, '资料不存在', 'LIBRARY_ASSET_NOT_FOUND')
    }

    return
  }

  if (ref.category === 'knowledge_base_attachment') {
    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: {
        id: ref.sourceId,
        userId,
        storageKey: ref.storageKey
      },
      select: { id: true }
    })

    if (!knowledgeBase) {
      throw new AppError(404, '资料不存在', 'LIBRARY_ASSET_NOT_FOUND')
    }

    return
  }

  const materializedGeneratedImage = await prisma.fileUpload.findFirst({
    where: {
      id: ref.sourceId,
      userId,
      storageKey: ref.storageKey,
      source: 'generated'
    },
    select: { id: true }
  })

  if (materializedGeneratedImage) return

  const [generatedImage] = await prisma.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "Message" m
        INNER JOIN "Conversation" c ON c.id = m."conversationId"
        CROSS JOIN LATERAL jsonb_array_elements(m."fileList"::jsonb) AS file_item
        WHERE c."userId" = ${userId}
          AND m.id = ${ref.sourceId}
          AND m.role = 'assistant'
          AND m.type = 'image'
          AND file_item->>'storageKey' = ${ref.storageKey}
      ) AS "exists"
    `
  )

  if (!generatedImage?.exists) {
    throw new AppError(404, '资料不存在', 'LIBRARY_ASSET_NOT_FOUND')
  }
}

async function getStorageKeyReferenceState(
  userId: string,
  storageKey: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<DeleteReferenceState> {
  const [uploadRefs, knowledgeBaseRef, messageRef] = await Promise.all([
    client.fileUpload.findMany({
      where: {
        userId,
        storageKey
      },
      select: {
        conversation: { select: { id: true } },
        message: { select: { id: true } },
        conversationDraft: { select: { id: true } },
        conversationReferences: {
          select: { messageId: true, conversationId: true }
        }
      }
    }),
    client.knowledgeBase.findFirst({
      where: {
        userId,
        storageKey
      },
      select: { id: true }
    }),
    client.$queryRaw<Array<{ exists: boolean }>>(
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
  ])

  return {
    hasActiveDraft: uploadRefs.some((file) => Boolean(file.conversationDraft)),
    hasActiveConversation: uploadRefs.some(
      (file) => Boolean(file.conversation) || file.conversationReferences.length > 0
    ),
    hasActiveMessage:
      uploadRefs.some(
        (file) =>
          Boolean(file.message) ||
          file.conversationReferences.some((reference) => Boolean(reference.messageId))
      ) || Boolean(messageRef[0]?.exists),
    hasActiveKnowledgeBase: Boolean(knowledgeBaseRef)
  }
}

export async function deleteLibraryAsset(userId: string, assetId: string) {
  const ref = decodeAssetId(assetId)
  await assertAssetSourceBelongsToUser(userId, ref)

  await prisma.$transaction(async (tx) => {
    const referenceState = await getStorageKeyReferenceState(userId, ref.storageKey, tx)
    const blockedReason = getDeleteBlockedReason(referenceState)

    if (blockedReason) {
      throw new AppError(409, blockedReason, 'LIBRARY_ASSET_IN_USE')
    }

    const deleted = await tx.fileUpload.deleteMany({
      where: {
        userId,
        storageKey: ref.storageKey,
        conversationId: null,
        messageId: null,
        conversationDraft: { is: null },
        conversationReferences: { none: {} }
      }
    })

    if (deleted.count === 0) {
      throw new AppError(409, '资料状态已变化，请刷新后重试', 'LIBRARY_ASSET_STATE_CHANGED')
    }
  })

  try {
    await deleteObject(ref.storageKey)
  } catch (error) {
    // The DB row is already removed so no active reference can point at a missing object.
    console.error('资料对象存储删除失败:', error)
  }

  return { deleted: true }
}

export async function listSelectableLibraryAssets(
  userId: string,
  options: { query?: string; category?: string }
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? ''
  const category = options.category
  const assets = await listLibraryAssets(userId)

  return assets.filter((asset) => {
    if (asset.category === 'knowledge_base_attachment') return false
    if (category && category !== 'all' && asset.category !== category) return false
    return !query || asset.fileName.toLocaleLowerCase().includes(query)
  })
}

type GeneratedImageMaterializationRow = {
  messageId: string
  conversationId: string
  name: string | null
  size: number | null
  createdAt: Date
}

async function materializeGeneratedImage(userId: string, ref: LibraryAssetRef) {
  const existing = await prisma.fileUpload.findUnique({
    where: { storageKey: ref.storageKey }
  })

  if (existing) {
    if (existing.userId !== userId) {
      throw new AppError(403, '无权使用此资料', 'FORBIDDEN')
    }
    return existing
  }

  const rows = await prisma.$queryRaw<GeneratedImageMaterializationRow[]>(
    Prisma.sql`
      SELECT
        m.id AS "messageId",
        c.id AS "conversationId",
        file_item->>'name' AS "name",
        CASE
          WHEN file_item->>'size' ~ '^[0-9]+$' THEN (file_item->>'size')::int
          ELSE 0
        END AS "size",
        m."createdAt" AS "createdAt"
      FROM "Message" m
      INNER JOIN "Conversation" c ON c.id = m."conversationId"
      CROSS JOIN LATERAL jsonb_array_elements(m."fileList"::jsonb) AS file_item
      WHERE c."userId" = ${userId}
        AND m.id = ${ref.sourceId}
        AND m.role = 'assistant'
        AND m.type = 'image'
        AND file_item->>'storageKey' = ${ref.storageKey}
      LIMIT 1
    `
  )
  const image = rows[0]

  if (!image) {
    throw new AppError(404, '资料不存在', 'LIBRARY_ASSET_NOT_FOUND')
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const file = await tx.fileUpload.create({
        data: {
          userId,
          originalName: image.name || getGeneratedImageFileName(image.createdAt),
          mimeType: 'image/png',
          size: image.size ?? 0,
          storageKey: ref.storageKey,
          storageUrl: '',
          kind: 'image',
          source: 'generated',
          conversationId: image.conversationId,
          messageId: image.messageId
        }
      })

      await tx.fileConversationReference.create({
        data: {
          fileUploadId: file.id,
          conversationId: image.conversationId,
          messageId: image.messageId
        }
      })

      return file
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const concurrentFile = await prisma.fileUpload.findUnique({
        where: { storageKey: ref.storageKey }
      })
      if (concurrentFile?.userId === userId) return concurrentFile
    }
    throw error
  }
}

export async function attachLibraryAsset(
  userId: string,
  assetId: string,
  options: { conversationId?: string; conversationDraft?: boolean }
) {
  const ref = decodeAssetId(assetId)

  if (ref.category === 'knowledge_base_attachment') {
    throw new AppError(400, '知识库附件不能作为对话附件添加', 'UNSUPPORTED_LIBRARY_ASSET')
  }

  await assertAssetSourceBelongsToUser(userId, ref)
  const file =
    ref.category === 'generated_image'
      ? await materializeGeneratedImage(userId, ref)
      : await prisma.fileUpload.findFirst({
          where: { id: ref.sourceId, userId, storageKey: ref.storageKey }
        })

  if (!file) {
    throw new AppError(404, '资料不存在', 'LIBRARY_ASSET_NOT_FOUND')
  }

  if (options.conversationId) {
    await attachPendingFileReference(userId, file.id, options.conversationId)
  } else if (options.conversationDraft) {
    await attachFileToConversationDraft(userId, file.id)
  }

  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    storageKey: file.storageKey,
    kind: file.kind === 'image' ? ('image' as const) : ('file' as const),
    processingStatus: file.processingStatus
  }
}
