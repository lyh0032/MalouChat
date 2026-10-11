import { z } from 'zod'

export const registerBodySchema = z.object({
  email: z.string().trim().email(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .refine((value) => !/^visitor_\d+$/i.test(value), {
      message: 'Visitor_数字格式为系统访客保留'
    }),
  password: z.string().min(8).max(128)
})

export const loginBodySchema = z.object({
  emailOrUsername: z.string().trim().min(1),
  password: z.string().min(8).max(128)
})

export const guestLoginBodySchema = z.object({
  guestKey: z.string().trim().min(32).max(256).optional()
})

export type RegisterBody = z.infer<typeof registerBodySchema>
export type LoginBody = z.infer<typeof loginBodySchema>
export type GuestLoginBody = z.infer<typeof guestLoginBodySchema>
