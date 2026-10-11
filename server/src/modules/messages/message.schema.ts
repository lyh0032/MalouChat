import { z } from 'zod'

export const messageParamsSchema = z.object({
  conversationId: z.string().trim().min(1)
})

export const messageStreamParamsSchema = z.object({
  conversationId: z.string().trim().min(1),
  messageId: z.string().trim().min(1)
})

export const createMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  fileIds: z.array(z.string().trim().min(1)).max(5).optional(),
  knowledgeBaseId: z.string().trim().min(1).optional(),
  deepThinkingEnabled: z.boolean().optional(),
  timeZone: z.string().trim().max(100).optional()
})

export const clientToolResultBodySchema = z.object({
  requestId: z.string().trim().min(1),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().trim().max(1000).optional()
})

export const updateMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(4000)
})

export const updateMessageParamsSchema = z.object({
  conversationId: z.string().trim().min(1),
  messageId: z.string().trim().min(1)
})

export const deleteMessageParamsSchema = z.object({
  conversationId: z.string().trim().min(1),
  messageId: z.string().trim().min(1)
})

export const regenerateMessageParamsSchema = z.object({
  conversationId: z.string().trim().min(1),
  messageId: z.string().trim().min(1)
})

export const regenerateMessageBodySchema = z.object({
  deepThinkingEnabled: z.boolean().optional(),
  timeZone: z.string().trim().max(100).optional()
})

export type CreateMessageBody = z.infer<typeof createMessageBodySchema>
export type ClientToolResultBody = z.infer<typeof clientToolResultBodySchema>
export type UpdateMessageBody = z.infer<typeof updateMessageBodySchema>
export type RegenerateMessageBody = z.infer<typeof regenerateMessageBodySchema>
