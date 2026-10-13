import { localizeErrorMessage } from '../i18n/errors'
import { t } from '../i18n'
import { clearStoredToken, getStoredToken, setStoredToken } from '../utils/token'
import { toast } from '../utils/toast'
import type { ApiErrorResponse, ApiResponse } from '../types/api'

function normalizeBaseUrl(rawBaseUrl?: string): string {
  const trimmed = rawBaseUrl?.trim()

  if (!trimmed || trimmed === 'undefined') {
    return '/api'
  }

  return `${trimmed.replace(/\/$/, '')}/api`
}

export const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

function createAuthHeaders(headers?: HeadersInit): Headers {
  const normalizedHeaders = new Headers(headers)
  const token = getStoredToken()

  if (token) {
    normalizedHeaders.set('Authorization', `Bearer ${token}`)
  }

  return normalizedHeaders
}

function handleUnauthorized() {
  clearStoredToken()
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

let refreshPromise: Promise<string> | null = null

async function requestNewAccessToken(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error(t('ui.yourSessionHasExpired'))
  }

  const payload = await parseResponseBody<ApiResponse<{ token: string }>>(response)
  const accessToken = payload.data.token

  if (!accessToken) {
    throw new Error(t('ui.invalidTokenRefreshResponse'))
  }

  setStoredToken(accessToken)
  return accessToken
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = requestNewAccessToken().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

function getTokenExpiration(token: string): number {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return 0

    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const payload = JSON.parse(atob(paddedBase64)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

export async function ensureFreshAccessToken(): Promise<void> {
  const token = getStoredToken()
  if (getTokenExpiration(token) > Date.now() + 60_000) return

  try {
    await refreshAccessToken()
  } catch {
    handleUnauthorized()
    throw new Error(t('ui.yourSessionHasExpiredPleaseSignInAgain'))
  }
}

async function parseResponseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  return (await response.text()) as T
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') {
        continue
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item))
        }
        continue
      }

      url.searchParams.set(key, String(value))
    }
  }

  return `${url.pathname}${url.search}`
}

async function handleErrorResponse(response: Response): Promise<never> {
  const payload = await parseResponseBody<ApiErrorResponse | string | null>(response)
  const message = localizeErrorMessage(
    typeof payload === 'string'
      ? payload || t('ui.requestFailed')
      : payload?.message || t('ui.requestFailed'),
    typeof payload === 'object' && payload ? payload.errorCode : undefined
  )

  toast.error(message)

  const error = new Error(message) as Error & {
    status: number
    payload: ApiErrorResponse | string | null
  }

  error.status = response.status
  error.payload = payload

  throw error
}

type RequestOptions = {
  body?: unknown
  headers?: HeadersInit
  params?: Record<string, unknown>
  signal?: AbortSignal
  suppressToast?: boolean
}

const refreshExcludedPaths = new Set([
  '/auth/login',
  '/auth/guest',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout'
])

async function fetchWithTokenRefresh(
  path: string,
  url: string,
  init: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include'
  })

  if (response.status !== 401 || refreshExcludedPaths.has(path)) {
    return response
  }

  try {
    await refreshAccessToken()
  } catch {
    return response
  }

  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: createAuthHeaders(init.headers)
  })
}

async function request<T>(method: string, path: string, options: RequestOptions = {}) {
  const headers = createAuthHeaders(options.headers)

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithTokenRefresh(path, buildUrl(path, options.params), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  })

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized()
    }

    if (options.suppressToast) {
      const payload = await parseResponseBody<ApiErrorResponse | string | null>(response)
      const message = localizeErrorMessage(
        typeof payload === 'string'
          ? payload || t('ui.requestFailed')
          : payload?.message || t('ui.requestFailed'),
        typeof payload === 'object' && payload ? payload.errorCode : undefined
      )
      const error = new Error(message) as Error & {
        status: number
        payload: ApiErrorResponse | string | null
      }
      error.status = response.status
      error.payload = payload
      throw error
    }
    return handleErrorResponse(response)
  }

  const data = await parseResponseBody<T>(response)

  return {
    data,
    status: response.status,
    headers: response.headers
  }
}

export function fetchWithAuth(path: string, init: RequestInit = {}) {
  return fetchWithTokenRefresh(path, `${apiBaseUrl}${path}`, {
    ...init,
    headers: createAuthHeaders(init.headers)
  })
}

export async function ensureFetchResponseOk(response: Response, fallbackMessage: string) {
  if (response.ok) {
    return response
  }

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error(t('ui.pleaseSignInToContinue'))
  }

  const payload = await parseResponseBody<ApiErrorResponse | string | null>(response)
  const message = localizeErrorMessage(
    typeof payload === 'string' ? payload || fallbackMessage : payload?.message || fallbackMessage,
    typeof payload === 'object' && payload ? payload.errorCode : undefined
  )

  toast.error(message)
  throw new Error(message)
}

export const http = {
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>) {
    return request<T>('GET', path, options)
  },
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return request<T>('POST', path, { ...options, body })
  },
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return request<T>('PUT', path, { ...options, body })
  },
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) {
    return request<T>('PATCH', path, { ...options, body })
  },
  delete<T>(path: string, options?: Omit<RequestOptions, 'body'>) {
    return request<T>('DELETE', path, options)
  }
}
