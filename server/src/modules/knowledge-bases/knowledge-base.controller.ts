import type { Request, Response } from 'express'
import fs from 'fs'

import { sendDeleted, sendSuccess } from '../../utils/http'
import { AppError } from '../../utils/app-error'
import {
  createKnowledgeBaseBodySchema,
  inviteKnowledgeBaseMembersBodySchema,
  updateKnowledgeBaseBodySchema,
  updateKnowledgeBaseVisibilityBodySchema
} from './knowledge-base.schema'
import {
  acceptKnowledgeBaseInvitation,
  createKnowledgeBase,
  deleteKnowledgeBase,
  inviteKnowledgeBaseMembers,
  leaveKnowledgeBase,
  listKnowledgeBaseInvitations,
  listKnowledgeBaseMembers,
  listKnowledgeBases,
  rejectKnowledgeBaseInvitation,
  removeKnowledgeBaseMember,
  updateKnowledgeBaseVisibility,
  updateKnowledgeBase
} from './knowledge-base.service'

export async function listKnowledgeBasesController(req: Request, res: Response) {
  const data = await listKnowledgeBases(req.currentUser!.id)
  sendSuccess(res, data, '获取知识库成功')
}

export async function createKnowledgeBaseController(req: Request, res: Response) {
  try {
    const parsed = updateKnowledgeBaseBodySchema.safeParse(req.body)

    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.issues[0]?.message || '知识库参数错误',
        'VALIDATION_ERROR'
      )
    }

    const data = await createKnowledgeBase(req.currentUser!.id, parsed.data, req.file)
    sendSuccess(res, data, '创建知识库成功', 201)
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {})
    }
  }
}

export async function updateKnowledgeBaseVisibilityController(
  req: Request<{ id: string }>,
  res: Response
) {
  const parsed = updateKnowledgeBaseVisibilityBodySchema.safeParse(req.body)

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || '知识库参数错误', 'VALIDATION_ERROR')
  }

  const data = await updateKnowledgeBaseVisibility(req.currentUser!.id, req.params.id, parsed.data)
  sendSuccess(res, data, '更新知识库可见性成功')
}

export async function listKnowledgeBaseMembersController(
  req: Request<{ id: string }>,
  res: Response
) {
  const data = await listKnowledgeBaseMembers(req.currentUser!.id, req.params.id)
  sendSuccess(res, data, '获取团队成员成功')
}

export async function inviteKnowledgeBaseMembersController(
  req: Request<{ id: string }>,
  res: Response
) {
  const parsed = inviteKnowledgeBaseMembersBodySchema.safeParse(req.body)

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || '邀请参数错误', 'VALIDATION_ERROR')
  }

  const data = await inviteKnowledgeBaseMembers(req.currentUser!.id, req.params.id, parsed.data)
  sendSuccess(res, data, '邀请已发送')
}

export async function removeKnowledgeBaseMemberController(
  req: Request<{ id: string; userId: string }>,
  res: Response
) {
  await removeKnowledgeBaseMember(req.currentUser!.id, req.params.id, req.params.userId)
  sendDeleted(res)
}

export async function leaveKnowledgeBaseController(req: Request<{ id: string }>, res: Response) {
  await leaveKnowledgeBase(req.currentUser!.id, req.params.id)
  sendDeleted(res)
}

export async function listKnowledgeBaseInvitationsController(req: Request, res: Response) {
  const data = await listKnowledgeBaseInvitations(req.currentUser!.id)
  sendSuccess(res, data, '获取知识库邀请成功')
}

export async function acceptKnowledgeBaseInvitationController(
  req: Request<{ invitationId: string }>,
  res: Response
) {
  await acceptKnowledgeBaseInvitation(req.currentUser!.id, req.params.invitationId)
  sendDeleted(res)
}

export async function rejectKnowledgeBaseInvitationController(
  req: Request<{ invitationId: string }>,
  res: Response
) {
  await rejectKnowledgeBaseInvitation(req.currentUser!.id, req.params.invitationId)
  sendDeleted(res)
}

export async function updateKnowledgeBaseController(
  req: Request<{ id: string }>,
  res: Response
) {
  try {
    const parsed = createKnowledgeBaseBodySchema.safeParse(req.body)

    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.issues[0]?.message || '知识库参数错误',
        'VALIDATION_ERROR'
      )
    }

    const data = await updateKnowledgeBase(
      req.currentUser!.id,
      req.params.id,
      parsed.data,
      req.file
    )
    sendSuccess(res, data, '更新知识库成功')
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {})
    }
  }
}

export async function deleteKnowledgeBaseController(
  req: Request<{ id: string }>,
  res: Response
) {
  await deleteKnowledgeBase(req.currentUser!.id, req.params.id)
  sendDeleted(res)
}
