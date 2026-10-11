export type ProjectRecord = {
  id: string
  icon: string
  iconColor: string
  title: string
  prompt: string
  conversationCount: number
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  icon: string
  iconColor: string
  title: string
  prompt?: string
}

export type UpdateProjectInput = Partial<CreateProjectInput>
