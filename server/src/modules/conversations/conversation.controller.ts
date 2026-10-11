import type { Request, Response } from 'express'

import {
  createConversation,
  deleteConversation,
  getConversationDetail,
  listConversations,
  pinConversation,
  updateConversation,
  updateConversationKnowledgeBase,
  updateConversationProject
} from './conversation.service'
import { sendDeleted, sendSuccess } from '../../utils/http'

type ConversationParams = {
  conversationId: string
}

export async function listConversationsController(req: Request, res: Response) {
  const conversations = await listConversations(req.currentUser!.id)
  sendSuccess(res, { conversations }, '获取会话列表成功')
}

export async function createConversationController(req: Request, res: Response) {
  const { conversation, existed } = await createConversation(req.currentUser!.id, req.body)
  if (existed) {
    sendSuccess(res, { conversation, existed: true }, '已切换到现有会话', 200)
  } else {
    sendSuccess(res, { conversation, existed: false }, '创建会话成功', 201)
  }
}

export async function getConversationDetailController(
  req: Request<ConversationParams>,
  res: Response
) {
  const conversation = await getConversationDetail(req.currentUser!.id, req.params.conversationId)
  sendSuccess(res, conversation, '获取会话详情成功')
}

export async function updateConversationController(
  req: Request<ConversationParams>,
  res: Response
) {
  const conversation = await updateConversation(
    req.currentUser!.id,
    req.params.conversationId,
    req.body
  )
  sendSuccess(res, conversation, '更新会话成功')
}

export async function pinConversationController(req: Request<ConversationParams>, res: Response) {
  const conversation = await pinConversation(req.currentUser!.id, req.params.conversationId, req.body)
  sendSuccess(res, conversation, req.body.isPinned ? '置顶会话成功' : '取消置顶成功')
}

export async function updateConversationKnowledgeBaseController(
  req: Request<ConversationParams, unknown, { knowledgeBaseId?: string | null }>,
  res: Response
) {
  const { knowledgeBaseId } = req.body

  const conversation = await updateConversationKnowledgeBase(
    req.currentUser!.id,
    req.params.conversationId,
    knowledgeBaseId || null
  )
  sendSuccess(res, conversation, '更新知识库关联成功')
}

export async function updateConversationProjectController(
  req: Request<ConversationParams, unknown, { projectId?: string | null }>,
  res: Response
) {
  const { projectId } = req.body

  const conversation = await updateConversationProject(
    req.currentUser!.id,
    req.params.conversationId,
    projectId || null
  )
  sendSuccess(res, conversation, '更新项目关联成功')
}

export async function deleteConversationController(
  req: Request<ConversationParams>,
  res: Response
) {
  await deleteConversation(req.currentUser!.id, req.params.conversationId)
  sendDeleted(res, '删除会话成功')
}
