export type LibraryAssetCategory =
  | 'user_file'
  | 'user_image'
  | 'generated_image'
  | 'knowledge_base_attachment'

export type LibraryAsset = {
  id: string
  fileName: string
  size: number
  category: LibraryAssetCategory
  categoryLabel: string
  storageKey: string
  conversationId: string | null
  conversationTitle: string | null
  conversationReferenceType: 'conversation' | 'draft' | null
  conversationReferences: Array<{
    conversationId: string | null
    conversationTitle: string
    type: 'conversation' | 'draft'
  }>
  createdAt: string
  downloadable: boolean
  deletable: boolean
  deleteBlockedReason: string | null
}
