import { z } from 'zod'

export const updateModelPreferenceBodySchema = z.object({
  modelId: z.string().min(1, '模型 ID 不能为空')
})

export type UpdateModelPreferenceBody = z.infer<typeof updateModelPreferenceBodySchema>
