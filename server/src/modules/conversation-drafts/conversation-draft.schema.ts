import { z } from 'zod'

export const updateConversationDraftKnowledgeBaseBodySchema = z.object({
  knowledgeBaseId: z.string().trim().min(1).nullable()
})

export type UpdateConversationDraftKnowledgeBaseBody = z.infer<
  typeof updateConversationDraftKnowledgeBaseBodySchema
>
