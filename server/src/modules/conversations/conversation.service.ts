import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import { serializeMessageForClient } from '../../utils/message-files'
import { ensureAccessibleKnowledgeBase } from '../knowledge-bases/knowledge-base.service'
import { normalizeProjectId } from '../projects/project.service'
import { moveDraftFileToConversation } from '../files/file-reference.service'
import type {
  CreateConversationBody,
  PinConversationBody,
  UpdateConversationBody
} from './conversation.schema'

const conversationSummarySelect = {
  id: true,
  title: true,
  isPinned: true,
  projectId: true,
  knowledgeBaseId: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ConversationSelect

function buildConversationTitle(title?: string): string {
  if (title?.trim()) {
    return title.trim().slice(0, 120)
  }

  return '新会话'
}

export async function listConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: {
          content: true,
          role: true,
          status: true,
          createdAt: true
        }
      },
      _count: {
        select: { messages: true }
      }
    }
  })

  conversations.sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }

    const leftLastMessageAt = left.messages[0]?.createdAt ?? left.createdAt
    const rightLastMessageAt = right.messages[0]?.createdAt ?? right.createdAt
    const activityTimeDifference = rightLastMessageAt.getTime() - leftLastMessageAt.getTime()

    return activityTimeDifference || right.createdAt.getTime() - left.createdAt.getTime()
  })

  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    isPinned: conversation.isPinned,
    projectId: conversation.projectId,
    knowledgeBaseId: conversation.knowledgeBaseId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessagePreview:
      conversation.messages.find((message) => message.content.trim().length > 0)?.content ?? '',
    messageCount: conversation._count.messages,
    isGenerating: conversation.messages.some(
      (message) => message.role === 'assistant' && message.status === 'generating'
    )
  }))
}

export async function createConversation(userId: string, data: CreateConversationBody) {
  const projectId = await normalizeProjectId(userId, data.projectId)
  const shouldConsumeDraft = data.consumeDraft === true && !projectId
  const draft = shouldConsumeDraft
    ? await prisma.conversationDraft.findUnique({
        where: { userId },
        select: {
          id: true,
          knowledgeBaseId: true,
          fileUploadId: true
        }
      })
    : null
  const knowledgeBaseId = await ensureAccessibleKnowledgeBase(
    userId,
    data.knowledgeBaseId !== undefined ? data.knowledgeBaseId : draft?.knowledgeBaseId
  )

  const conversation = await prisma.$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: {
        userId,
        title: buildConversationTitle(data.title),
        projectId,
        knowledgeBaseId
      },
      select: conversationSummarySelect
    })

    if (draft?.fileUploadId) {
      await moveDraftFileToConversation(tx, userId, draft.fileUploadId, created.id)
    }

    if (draft) {
      await tx.conversationDraft.update({
        where: { id: draft.id },
        data: {
          knowledgeBaseId: null,
          fileUploadId: null
        }
      })
    }

    return created
  })

  return {
    conversation: {
      ...conversation,
      lastMessagePreview: '',
      messageCount: 0,
      isGenerating: false
    },
    existed: false
  }
}

export async function getConversationDetail(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!conversation) {
    throw new AppError(404, '会话不存在', 'NOT_FOUND')
  }

  return {
    ...conversation,
    messages: conversation.messages.map(serializeMessageForClient)
  }
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  data: UpdateConversationBody
) {
  await ensureConversationOwnership(userId, conversationId)

  const updateData: Record<string, unknown> = {}

  if (data.title !== undefined) {
    updateData.title = data.title
  }

  if (data.knowledgeBaseId !== undefined) {
    updateData.knowledgeBaseId = await ensureAccessibleKnowledgeBase(userId, data.knowledgeBaseId)
  }

  if (data.projectId !== undefined) {
    updateData.projectId = await normalizeProjectId(userId, data.projectId)
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: updateData,
    select: conversationSummarySelect
  })
}

export async function updateConversationProject(
  userId: string,
  conversationId: string,
  projectId: string | null
) {
  await ensureConversationOwnership(userId, conversationId)
  const nextProjectId = await normalizeProjectId(userId, projectId)

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { projectId: nextProjectId },
    select: conversationSummarySelect
  })
}

export async function updateConversationKnowledgeBase(
  userId: string,
  conversationId: string,
  knowledgeBaseId: string | null
) {
  await ensureConversationOwnership(userId, conversationId)
  const nextKnowledgeBaseId = await ensureAccessibleKnowledgeBase(userId, knowledgeBaseId)

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { knowledgeBaseId: nextKnowledgeBaseId },
    select: conversationSummarySelect
  })
}

export async function pinConversation(
  userId: string,
  conversationId: string,
  data: PinConversationBody
) {
  await ensureConversationOwnership(userId, conversationId)

  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      isPinned: data.isPinned,
      updatedAt: new Date()
    },
    select: conversationSummarySelect
  })
}

export async function deleteConversation(userId: string, conversationId: string) {
  await ensureConversationOwnership(userId, conversationId)
  await prisma.conversation.delete({ where: { id: conversationId } })
}

export async function ensureConversationOwnership(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true }
  })

  if (!conversation) {
    throw new AppError(404, '会话不存在', 'NOT_FOUND')
  }

  return conversation
}
