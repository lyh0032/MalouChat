import type { Request, Response } from 'express'

import { sendSuccess } from '../../utils/http'
import {
  getConversationDraft,
  updateConversationDraftKnowledgeBase
} from './conversation-draft.service'

export async function getConversationDraftController(req: Request, res: Response) {
  const draft = await getConversationDraft(req.currentUser!.id)
  sendSuccess(res, draft, '获取新会话草稿成功')
}

export async function updateConversationDraftKnowledgeBaseController(
  req: Request<unknown, unknown, { knowledgeBaseId: string | null }>,
  res: Response
) {
  const draft = await updateConversationDraftKnowledgeBase(
    req.currentUser!.id,
    req.body.knowledgeBaseId
  )
  sendSuccess(res, draft, '新会话知识库已更新')
}
