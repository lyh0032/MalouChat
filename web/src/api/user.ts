import { ensureFetchResponseOk, fetchWithAuth } from './http'
import type { UserSearchResult } from '../types/user'

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const params = new URLSearchParams({ q: query })
  const response = await fetchWithAuth(`/users/search?${params.toString()}`, { method: 'GET' })
  await ensureFetchResponseOk(response, '搜索用户失败')
  const json = await response.json()
  return json.data.users as UserSearchResult[]
}
