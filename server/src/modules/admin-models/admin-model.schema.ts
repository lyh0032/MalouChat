import { z } from 'zod'

export const aiModelTypeSchema = z.enum(['chat', 'embedding', 'vision', 'speech', 'image'])

const imageSettingsSchema = z.object({
  size: z.string().trim().regex(/^\d+\*\d+$/, '尺寸格式应为 宽*高，例如 1024*1024'),
  promptExtend: z.boolean(),
  watermark: z.boolean()
})

export const aiModelParamsSchema = z.object({
  modelId: z.string().trim().min(1)
})

export const applyChatModelToAllBodySchema = z.object({
  modelId: z.string().trim().min(1)
})

export const reorderChatModelsBodySchema = z.object({
  modelIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(100)
    .refine((modelIds) => new Set(modelIds).size === modelIds.length, {
      message: '模型排序中不能包含重复项'
    })
})

export const createAiModelBodySchema = z.object({
  code: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  provider: z.string().trim().min(1).max(40).default('dashscope'),
  type: aiModelTypeSchema,
  isEnabled: z.boolean().default(true),
  isUserSelectable: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  dimensions: z.number().int().positive().nullable().optional(),
  settings: imageSettingsSchema.nullable().optional()
})

export const updateAiModelBodySchema = createAiModelBodySchema.partial()

export type AiModelTypeInput = z.infer<typeof aiModelTypeSchema>
export type CreateAiModelBody = z.infer<typeof createAiModelBodySchema>
export type UpdateAiModelBody = z.infer<typeof updateAiModelBodySchema>
export type ImageSettingsBody = z.infer<typeof imageSettingsSchema>
