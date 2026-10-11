export function normalizeProjectTarget(projectId?: string | null) {
  return projectId || null
}

export function shouldMoveConversationProject({
  currentProjectId,
  targetProjectId
}: {
  currentProjectId?: string | null
  targetProjectId?: string | null
}) {
  return normalizeProjectTarget(currentProjectId) !== normalizeProjectTarget(targetProjectId)
}

type DraggedConversation = {
  id: string
  projectId: string | null
}

let draggedConversation: DraggedConversation | null = null

export function setDraggedConversation(conversation: DraggedConversation | null) {
  draggedConversation = conversation
}

export function getDraggedConversation() {
  return draggedConversation
}
