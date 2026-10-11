import { z } from 'zod'

export const knowledgeBaseParamsSchema = z.object({
  id: z.string().trim().min(1)
})

export const knowledgeBaseUserParamsSchema = knowledgeBaseParamsSchema.extend({
  userId: z.string().trim().min(1)
})

export const knowledgeBaseInvitationParamsSchema = z.object({
  invitationId: z.string().trim().min(1)
})

export const createKnowledgeBaseBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(1000),
  visibility: z.enum(['private', 'team']).optional()
})

export const updateKnowledgeBaseBodySchema = createKnowledgeBaseBodySchema

export const updateKnowledgeBaseVisibilityBodySchema = z.object({
  visibility: z.enum(['private', 'team'])
})

export const inviteKnowledgeBaseMembersBodySchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1).max(20)
})

export type CreateKnowledgeBaseBody = z.infer<typeof createKnowledgeBaseBodySchema>
export type UpdateKnowledgeBaseBody = z.infer<typeof updateKnowledgeBaseBodySchema>
export type UpdateKnowledgeBaseVisibilityBody = z.infer<
  typeof updateKnowledgeBaseVisibilityBodySchema
>
export type InviteKnowledgeBaseMembersBody = z.infer<
  typeof inviteKnowledgeBaseMembersBodySchema
>
