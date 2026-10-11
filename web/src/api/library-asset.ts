import { ensureFetchResponseOk, fetchWithAuth } from './http'
import type { LibraryAsset } from '../types/library-asset'
import type { UploadedFile } from './file'

export async function fetchLibraryAssets(): Promise<LibraryAsset[]> {
  const response = await fetchWithAuth('/library-assets', { method: 'GET' })
  await ensureFetchResponseOk(response, '获取资料库失败')
  const json = await response.json()
  return json.data as LibraryAsset[]
}

export async function deleteLibraryAsset(assetId: string): Promise<void> {
  const response = await fetchWithAuth(`/library-assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE'
  })
  await ensureFetchResponseOk(response, '删除资料失败')
}

export async function fetchSelectableLibraryAssets(options?: {
  query?: string
  category?: string
}): Promise<LibraryAsset[]> {
  const params = new URLSearchParams()
  if (options?.query?.trim()) params.set('q', options.query.trim())
  if (options?.category && options.category !== 'all') params.set('category', options.category)
  const suffix = params.size ? `?${params.toString()}` : ''
  const response = await fetchWithAuth(`/library-assets/selectable${suffix}`, { method: 'GET' })
  await ensureFetchResponseOk(response, '获取可选资料失败')
  const json = await response.json()
  return json.data as LibraryAsset[]
}

export async function attachLibraryAsset(
  assetId: string,
  options: { conversationId?: string; conversationDraft?: boolean }
): Promise<UploadedFile> {
  const response = await fetchWithAuth(
    `/library-assets/${encodeURIComponent(assetId)}/attach`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    }
  )
  await ensureFetchResponseOk(response, '添加资料失败')
  const json = await response.json()
  return json.data as UploadedFile
}
