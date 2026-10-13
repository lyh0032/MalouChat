import { t } from '../i18n'
import { ensureFetchResponseOk, fetchWithAuth, http } from './http'
import type { UiLanguage } from '../i18n'
import type { ApiResponse } from '../types/api'
import type { UserSearchResult } from '../types/user'

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query })
  const response = await fetchWithAuth(`/users/search?${params.toString()}`, { method: 'GET' })
  await ensureFetchResponseOk(response, t('ui.failedToSearchUsers'))
  const json = await response.json()
  return json.data.users as UserSearchResult[]
}

export async function updateUserLanguage(language: UiLanguage) {
  const response = await http.patch<ApiResponse<{ language: UiLanguage }>>(
    '/users/me/language',
    { language },
    { suppressToast: true }
  )
  return response.data.data
}
