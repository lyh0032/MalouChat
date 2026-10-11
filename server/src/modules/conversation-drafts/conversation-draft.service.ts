import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import { ensureAccessibleKnowledgeBase } from '../knowledge-bases/knowledge-base.service'

const draftInclude = {
  fileUpload: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      storageKey: true,
      kind: true,
      processingStatus: true
    }
  }
} as const

function serializeDraft(
  draft: Awaited<ReturnType<typeof findOrCreateConversationDraft>>
) {
  return {
    id: draft.id,
    knowledgeBaseId: draft.knowledgeBaseId,
    file: draft.fileUpload
      ? {
          ...draft.fileUpload,
          kind: draft.fileUpload.kind === 'image' ? ('image' as const) : ('file' as const)
        }
      : null,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  }
}

function findOrCreateConversationDraft(userId: string) {
  return prisma.conversationDraft.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: draftInclude
  })
}

export async function getConversationDraft(userId: string) {
  let draft = await findOrCreateConversationDraft(userId)

  if (draft.knowledgeBaseId) {
    try {
      await ensureAccessibleKnowledgeBase(userId, draft.knowledgeBaseId)
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error
      }

      draft = await prisma.conversationDraft.update({
        where: { userId },
        data: { knowledgeBaseId: null },
        include: draftInclude
      })
    }
  }

  return serializeDraft(draft)
}

export async function updateConversationDraftKnowledgeBase(
  userId: string,
  knowledgeBaseId: string | null
) {
  const nextKnowledgeBaseId = await ensureAccessibleKnowledgeBase(userId, knowledgeBaseId)
  const draft = await prisma.conversationDraft.upsert({
    where: { userId },
    create: {
      userId,
      knowledgeBaseId: nextKnowledgeBaseId
    },
    update: {
      knowledgeBaseId: nextKnowledgeBaseId
    },
    include: draftInclude
  })

  return serializeDraft(draft)
}

export async function attachFileToConversationDraft(userId: string, fileUploadId: string) {
  const file = await prisma.fileUpload.findFirst({
    where: {
      id: fileUploadId,
      userId
    },
    select: { id: true }
  })

  if (!file) {
    throw new AppError(404, '草稿附件不存在', 'CONVERSATION_DRAFT_FILE_NOT_FOUND')
  }

  await prisma.conversationDraft.upsert({
    where: { userId },
    create: {
      userId,
      fileUploadId
    },
    update: {
      fileUploadId
    }
  })
}
