import { z } from 'zod'

export const updateLanguageBodySchema = z.object({
  language: z.enum(['zh-CN', 'en-US'])
})
