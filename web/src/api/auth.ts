import type { ApiResponse } from '../types/api'
import type { AuthPayload, GuestAuthPayload, LoginInput, RegisterInput, User } from '../types/auth'
import { hashPassword } from '../utils/hash'
import { getUiLanguage } from '../i18n'
import { http } from './http'

export async function register(input: RegisterInput): Promise<AuthPayload> {
  input = { ...input, language: getUiLanguage() }
  const response = await http.post<ApiResponse<AuthPayload>>(
    '/auth/register',
    {
      ...input,
      password: await hashPassword(input.password)
    },
    { suppressToast: true }
  )
  return response.data.data
}

export async function login(input: LoginInput): Promise<AuthPayload> {
  const response = await http.post<ApiResponse<AuthPayload>>(
    '/auth/login',
    {
      ...input,
      password: await hashPassword(input.password)
    },
    { suppressToast: true }
  )
  return response.data.data
}

export async function loginAsGuest(guestKey?: string): Promise<GuestAuthPayload> {
  const response = await http.post<ApiResponse<GuestAuthPayload>>('/auth/guest', {
    guestKey,
    language: getUiLanguage()
  })
  return response.data.data
}

export async function fetchMe(): Promise<User> {
  const response = await http.get<ApiResponse<User>>('/auth/me')
  return response.data.data
}

export async function logoutSession(): Promise<void> {
  await http.post<ApiResponse<{ loggedOut: boolean }>>('/auth/logout', undefined, {
    suppressToast: true
  })
}
