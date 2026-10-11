import { z } from 'zod'

const memoryTypeSchema = z.enum(['profile', 'preference', 'summary', 'fact'])

export const memoryParamsSchema = z.object({
  memoryId: z.string().trim().min(1)
})

export const memoryQuerySchema = z.object({
  type: memoryTypeSchema.optional(),
  search: z.string().trim().optional()
})

export const createMemoryBodySchema = z.object({
  type: memoryTypeSchema,
  key: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2000)
})

export const updateMemoryBodySchema = z
  .object({
    type: memoryTypeSchema.optional(),
    key: z.string().trim().min(1).max(80).optional(),
    content: z.string().trim().min(1).max(2000).optional()
  })
  .refine((data) => Object.keys(data).length > 0, '至少提供一个待更新字段')

export type MemoryQuery = z.infer<typeof memoryQuerySchema>
export type CreateMemoryBody = z.infer<typeof createMemoryBodySchema>
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>
