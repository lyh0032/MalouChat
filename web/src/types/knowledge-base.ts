export type KnowledgeBaseStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type KnowledgeBaseVisibility = 'private' | 'team'
export type KnowledgeBaseRole = 'owner' | 'member'

export type KnowledgeBaseUser = {
  id: string
  username: string
  email: string
}

export type KnowledgeBaseRecord = {
  id: string
  ownerId: string
  owner?: KnowledgeBaseUser
  role: KnowledgeBaseRole
  title: string
  content: string
  attachmentName: string | null
  attachmentMimeType: string | null
  attachmentSize: number | null
  storageKey: string | null
  visibility: KnowledgeBaseVisibility
  memberCount: number
  processingStatus: KnowledgeBaseStatus
  processingError: string | null
  createdAt: string
  updatedAt: string
}

export type CreateKnowledgeBaseInput = {
  title: string
  content: string
  visibility?: KnowledgeBaseVisibility
  file?: File | null
}

export type UpdateKnowledgeBaseInput = CreateKnowledgeBaseInput

export type KnowledgeBaseMember = KnowledgeBaseUser & {
  joinedAt: string
}

export type KnowledgeBaseInvitation = {
  id: string
  createdAt: string
  inviter: KnowledgeBaseUser
  knowledgeBase: {
    id: string
    title: string
  }
}
