import { useAdminModelStore } from './admin-model'
import { useChatStore } from './chat'
import { useKnowledgeBaseStore } from './knowledge-base'
import { useLibraryAssetStore } from './library-asset'
import { useMemoryStore } from './memory'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'

export function resetUserScopedStores() {
  useChatStore.getState().resetChatState()
  useProjectStore.getState().reset()
  useKnowledgeBaseStore.getState().reset()
  useLibraryAssetStore.getState().reset()
  useMemoryStore.getState().reset()
  usePreferencesStore.getState().reset()
  useAdminModelStore.getState().reset()
}
