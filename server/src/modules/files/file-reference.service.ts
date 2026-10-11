import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'

type DatabaseClient = Prisma.TransactionClient | typeof prisma

async function ensureOwnedFile(
  client: DatabaseClient,
  userId: string,
  fileUploadId: string
) {
  const file = await client.fileUpload.findFirst({
    where: { id: fileUploadId, userId },
    select: { id: true }
  })

  if (!file) {
    throw new AppError(404, '附件不存在', 'FILE_NOT_FOUND')
  }
}

async function ensureOwnedConversation(
  client: DatabaseClient,
  userId: string,
  conversationId: string
) {
  const conversation = await client.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true }
  })

  if (!conversation) {
    throw new AppError(404, '会话不存在', 'CONVERSATION_NOT_FOUND')
  }
}

export async function attachPendingFileReference(
  userId: string,
  fileUploadId: string,
  conversationId: string,
  client: DatabaseClient = prisma
) {
  await Promise.all([
    ensureOwnedFile(client, userId, fileUploadId),
    ensureOwnedConversation(client, userId, conversationId)
  ])

  const existing = await client.fileConversationReference.findFirst({
    where: { fileUploadId, conversationId, messageId: null },
    select: { id: true }
  })

  if (!existing) {
    try {
      await client.fileConversationReference.create({
        data: { fileUploadId, conversationId }
      })
    } catch (error) {
      // The partial unique index keeps concurrent pending attachments idempotent.
      if ((error as { code?: string }).code !== 'P2002') throw error
    }
  }
}

export async function finalizeFileReferences(
  client: Prisma.TransactionClient,
  userId: string,
  fileUploadIds: string[],
  conversationId: string,
  messageId: string
) {
  if (!fileUploadIds.length) return

  await client.fileConversationReference.deleteMany({
    where: {
      fileUploadId: { in: fileUploadIds },
      conversationId,
      messageId: null
    }
  })

  await client.fileConversationReference.createMany({
    data: fileUploadIds.map((fileUploadId) => ({
      fileUploadId,
      conversationId,
      messageId
    })),
    skipDuplicates: true
  })

  // Keep legacy one-to-one fields populated only when this is still the file's original context.
  await client.fileUpload.updateMany({
    where: {
      id: { in: fileUploadIds },
      userId,
      messageId: null,
      OR: [{ conversationId }, { conversationId: null }]
    },
    data: { conversationId, messageId }
  })
}

export async function detachComposerFile(
  userId: string,
  fileUploadId: string,
  options: { conversationId?: string; conversationDraft?: boolean }
) {
  await ensureOwnedFile(prisma, userId, fileUploadId)

  await prisma.$transaction(async (tx) => {
    if (options.conversationId) {
      await ensureOwnedConversation(tx, userId, options.conversationId)
      await tx.fileConversationReference.deleteMany({
        where: {
          fileUploadId,
          conversationId: options.conversationId,
          messageId: null
        }
      })
      await tx.fileUpload.updateMany({
        where: {
          id: fileUploadId,
          userId,
          conversationId: options.conversationId,
          messageId: null
        },
        data: { conversationId: null }
      })
    }

    if (options.conversationDraft) {
      await tx.conversationDraft.updateMany({
        where: { userId, fileUploadId },
        data: { fileUploadId: null }
      })
    }
  })
}

export async function moveDraftFileToConversation(
  client: Prisma.TransactionClient,
  userId: string,
  fileUploadId: string,
  conversationId: string
) {
  await attachPendingFileReference(userId, fileUploadId, conversationId, client)
  await client.fileUpload.updateMany({
    where: {
      id: fileUploadId,
      userId,
      conversationId: null,
      messageId: null
    },
    data: { conversationId }
  })
}
