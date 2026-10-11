import { z } from 'zod'

export const searchUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(80)
})

export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>
