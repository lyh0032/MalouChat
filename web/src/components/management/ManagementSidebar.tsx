import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'

import { updatePreferredModel } from '../../api/model-preference'
import { updateSpeechStyle } from '../../api/user-preference'
import { getLastChatRoute } from '../../router/chat-route-cache'
import { useAuthStore } from '../../stores/auth'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base'
import { usePreferencesStore } from '../../stores/preferences'
import { useThemeStore, type ThemeMode } from '../../stores/theme'
import ChatSettingsDialog from '../chat/ChatSettingsDialog'
import AppSidebarShell, { type AppSidebarActiveItem } from '../navigation/AppSidebarShell'

import './ManagementSidebar.css'

type ManagementSidebarProps = {
  isMobile: boolean
  isOpen: boolean
  activeItem?: AppSidebarActiveItem
  summaryTitle: string
  summaryText: string
  icon: ReactNode
  stats: ReactNode
  onClose: () => void
  onBack: () => void
}

export default function ManagementSidebar({
  isMobile,
  isOpen,
  activeItem = null,
  summaryTitle,
  summaryText,
  icon,
  stats,
  onClose,
  onBack
}: ManagementSidebarProps) {
  useTranslation()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setSpeechStyle = useAuthStore((state) => state.setSpeechStyle)
  const knowledgeBaseCount = useKnowledgeBaseStore((state) => state.knowledgeBases.length)
  const loadKnowledgeBases = useKnowledgeBaseStore((state) => state.loadKnowledgeBases)
  const preferences = usePreferencesStore()
  const themeMode = useThemeStore((state) => state.mode)
  const setThemeMode = useThemeStore((state) => state.setMode)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (activeItem === 'knowledge-bases') return
    void loadKnowledgeBases()
  }, [activeItem, loadKnowledgeBases])

  function closeOnMobile() {
    if (isMobile) onClose()
  }

  function navigateFromSidebar(path: string) {
    void navigate(path)
    closeOnMobile()
  }

  function openConversationSearch() {
    void navigate(getLastChatRoute(), { state: { openConversationSearch: true } })
    closeOnMobile()
  }

  function openSettings() {
    setSettingsOpen(true)
    void Promise.all([
      preferences.loadModelPreferences(),
      preferences.loadSpeechStylePreferences()
    ]).catch(() => undefined)
  }

  async function setModel(id: string) {
    try {
      const model = await updatePreferredModel({ modelId: id })
      preferences.setSelectedModelId(model.id)
      void message.success(t('ui.modelSwitched'))
    } catch {
      void preferences.loadModelPreferences(true)
      void message.error(t('ui.failedToSwitchModels'))
    }
  }

  async function setSpeech(id: string) {
    try {
      const style = await updateSpeechStyle(id)
      preferences.setSelectedSpeechStyleId(style.id)
      setSpeechStyle(style.id)
      void message.success(t('ui.responseStyleUpdated'))
    } catch {
      preferences.setSelectedSpeechStyleId(user?.speechStyle || 'default')
      void message.error(t('ui.failedToUpdateResponseStyle'))
    }
  }

  return (
    <>
      <AppSidebarShell
        mobile={isMobile}
        open={isOpen}
        activeItem={activeItem}
        knowledgeBaseCount={knowledgeBaseCount}
        isAdmin={Boolean(user?.isAdmin)}
        userInitial={(user?.username || 'U').charAt(0).toUpperCase()}
        userDisplayName={user?.username || t('ui.user')}
        onClose={onClose}
        onBrandClick={onBack}
        onCreateConversation={() => navigateFromSidebar('/chat')}
        onSearch={openConversationSearch}
        onNavigate={navigateFromSidebar}
        onSettings={openSettings}
      >
        <div className="management-sidebar-content">
          <section className="management-sidebar-summary">
            <div className="management-sidebar-summary-icon">{icon}</div>
            <div className="management-sidebar-summary-copy">
              <p>{summaryTitle}</p>
              <span>{summaryText}</span>
            </div>
          </section>

          <div className="management-sidebar-stats">{stats}</div>
        </div>
      </AppSidebarShell>

      <ChatSettingsDialog
        open={settingsOpen}
        themeMode={themeMode}
        models={preferences.availableModels}
        selectedModelId={preferences.selectedModelId}
        loadingModels={preferences.isLoadingModels}
        speechStyles={preferences.availableSpeechStyles}
        selectedSpeechStyleId={preferences.selectedSpeechStyleId}
        loadingSpeechStyles={preferences.isLoadingSpeechStyles}
        userDisplayName={user?.username || t('ui.user')}
        onClose={() => setSettingsOpen(false)}
        onTheme={(mode: ThemeMode) => setThemeMode(mode)}
        onModel={(id) => void setModel(id)}
        onSpeech={(id) => void setSpeech(id)}
        onNavigate={(path) => {
          setSettingsOpen(false)
          void navigate(path)
        }}
        onLogout={() => {
          logout()
          void navigate('/login')
        }}
      />
    </>
  )
}
