import { z } from 'zod'

export const projectParamsSchema = z.object({
  projectId: z.string().trim().min(1)
})

export const createProjectBodySchema = z.object({
  icon: z.string().trim().min(1).max(40),
  iconColor: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(20),
  prompt: z.string().trim().max(500).optional().default('')
})

export const updateProjectBodySchema = z.object({
  icon: z.string().trim().min(1).max(40).optional(),
  iconColor: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(1).max(20).optional(),
  prompt: z.string().trim().max(500).optional()
})

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>
