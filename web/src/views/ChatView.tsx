import { useTranslation } from 'react-i18next'
import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { updatePreferredModel } from '../api/model-preference'
import { updateSpeechStyle } from '../api/user-preference'
import type { UploadedFile } from '../api/file'
import ChatMainPanel from '../components/chat/ChatMainPanel'
import ChatSettingsDialog from '../components/chat/ChatSettingsDialog'
import ChatSidebar from '../components/chat/ChatSidebar'
import { ChatStartupSkeleton } from '../components/chat/ChatLoadingSkeletons'
import ConversationSearchDialog from '../components/chat/ConversationSearchDialog'
import ProjectDialog from '../components/chat/ProjectDialog'
import { useMobile } from '../hooks/useMobile'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useKnowledgeBaseStore } from '../stores/knowledge-base'
import { usePreferencesStore } from '../stores/preferences'
import { useProjectStore } from '../stores/project'
import { useThemeStore, type ThemeMode } from '../stores/theme'
import type { ConversationSummary } from '../types/chat'
import type { CreateProjectInput, ProjectRecord } from '../types/project'

import './ChatView.css'

const DEEP_THINKING_STORAGE_KEY = 'my-agent:deep-thinking-enabled'

export default function ChatView({ active = true }: { active?: boolean }) {
  useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ projectId?: string; conversationId?: string }>()
  const { message } = AntApp.useApp()
  const isMobile = useMobile()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setSpeechStyle = useAuthStore((state) => state.setSpeechStyle)
  const themeMode = useThemeStore((state) => state.mode)
  const setThemeMode = useThemeStore((state) => state.setMode)
  const chat = useChatStore()
  const projects = useProjectStore((state) => state.projects)
  const projectsLoading = useProjectStore((state) => state.isLoadingProjects)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const createProject = useProjectStore((state) => state.createProject)
  const updateProject = useProjectStore((state) => state.updateProject)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const knowledgeBases = useKnowledgeBaseStore((state) => state.knowledgeBases)
  const selectedKnowledgeBaseId = useKnowledgeBaseStore((state) => state.selectedKnowledgeBaseId)
  const loadKnowledgeBases = useKnowledgeBaseStore((state) => state.loadKnowledgeBases)
  const conversationBindingsDirty = useKnowledgeBaseStore(
    (state) => state.conversationBindingsDirty
  )
  const clearConversationBindingsDirty = useKnowledgeBaseStore(
    (state) => state.clearConversationBindingsDirty
  )
  const modelPreferences = usePreferencesStore()
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [initialLoading, setInitialLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null)
  const [submittingProject, setSubmittingProject] = useState(false)
  const [savingProjectPrompt, setSavingProjectPrompt] = useState(false)
  const [submittingPrompt, setSubmittingPrompt] = useState('')
  const [restoreRequest, setRestoreRequest] = useState<{
    id: number
    content: string
    files: UploadedFile[]
  } | null>(null)
  const [newConversationVersion, setNewConversationVersion] = useState(0)
  const routeSequenceRef = useRef(0)
  const creatingConversationRef = useRef(false)

  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    let active = true
    chat.resetChatState()
    void Promise.all([
      chat.loadConversations(),
      loadProjects(),
      loadKnowledgeBases(),
      modelPreferences.loadModelPreferences(),
      modelPreferences.loadSpeechStylePreferences()
    ])
      .catch((error) => {
        console.error('Failed to initialize chat:', error)
        void message.error(t('ui.failedToLoadTheConversationPleaseTryAgainLater'))
      })
      .finally(() => {
        if (active) setInitialLoading(false)
      })
    return () => {
      active = false
      routeSequenceRef.current += 1
      chat.detachActiveStream()
    }
  }, [])

  const wasActiveRef = useRef(active)
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active
    if (!active) {
      chat.detachActiveStream()
      return
    }
    if (!wasActive) {
      void Promise.all([
        loadKnowledgeBases(true, true),
        modelPreferences.loadModelPreferences(true),
        modelPreferences.loadSpeechStylePreferences(true)
      ])
        .then(() => {
          if (useKnowledgeBaseStore.getState().conversationBindingsDirty) {
            return chat.loadConversations(true).finally(clearConversationBindingsDirty)
          }
        })
        .catch((error) => console.error('Failed to revalidate cached chat context:', error))
      if (!chat.activeConversationId && !chat.activeProjectId)
        setNewConversationVersion((value) => value + 1)
      chat.resumeCurrentStream()
    }
  }, [
    active,
    chat.activeConversationId,
    chat.activeProjectId,
    chat.detachActiveStream,
    chat.loadConversations,
    chat.resumeCurrentStream,
    clearConversationBindingsDirty,
    conversationBindingsDirty,
    loadKnowledgeBases,
    modelPreferences.loadModelPreferences,
    modelPreferences.loadSpeechStylePreferences
  ])

  const activeConversation = useMemo(
    () => chat.conversations.find((item) => item.id === chat.activeConversationId) ?? null,
    [chat.activeConversationId, chat.conversations]
  )
  const activeProject = useMemo(
    () => projects.find((item) => item.id === chat.activeProjectId) ?? null,
    [chat.activeProjectId, projects]
  )
  const activeProjectConversations = useMemo(
    () => chat.conversations.filter((item) => item.projectId === chat.activeProjectId),
    [chat.activeProjectId, chat.conversations]
  )
  const routeKey =
    chat.activeConversationId || `${chat.activeProjectId || 'normal'}-new-${newConversationVersion}`

  useEffect(() => {
    const routeState = location.state as { openConversationSearch?: boolean } | null
    if (!active || !routeState?.openConversationSearch) return
    setSearchOpen(true)
    void navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null
    })
  }, [active, location.hash, location.pathname, location.search, location.state, navigate])

  function routeForConversation(conversation: ConversationSummary | undefined, id: string) {
    return conversation?.projectId
      ? `/chat/${conversation.projectId}/${id}`
      : `/chat?conversationId=${encodeURIComponent(id)}`
  }

  useEffect(() => {
    if (!creatingConversationRef.current || !chat.activeConversationId) return
    const conversation = chat.conversations.find((item) => item.id === chat.activeConversationId)
    if (!conversation) return
    void Promise.resolve(
      navigate(routeForConversation(conversation, conversation.id), { replace: true })
    ).finally(() => {
      creatingConversationRef.current = false
    })
  }, [chat.activeConversationId, chat.conversations, navigate])

  useEffect(() => {
    if (initialLoading || !active) return
    const sequence = ++routeSequenceRef.current
    const apply = async () => {
      const queryId = new URLSearchParams(location.search).get('conversationId') ?? ''
      const projectId = params.projectId ?? ''
      const pathConversationId = params.conversationId ?? ''
      const conversationId = queryId || pathConversationId
      if (!conversationId && creatingConversationRef.current) return
      if (conversationId) {
        const conversation = chat.conversations.find((item) => item.id === conversationId)
        if (!conversation || (projectId && conversation.projectId !== projectId)) {
          if (projectId && projects.some((project) => project.id === projectId)) {
            chat.startNewProjectConversation(projectId)
            await navigate(`/chat/${projectId}`, { replace: true })
          } else {
            chat.startNewConversation()
            await navigate('/chat', { replace: true })
          }
          return
        }
        if (chat.activeConversationId !== conversationId) {
          const selected = await chat.selectConversation(conversationId)
          if (!selected || sequence !== routeSequenceRef.current) return
        }
        const canonical = routeForConversation(conversation, conversationId)
        if (`${location.pathname}${location.search}` !== canonical)
          await navigate(canonical, { replace: true })
        return
      }
      if (projectId) {
        if (!projects.some((project) => project.id === projectId)) {
          chat.startNewConversation()
          await navigate('/chat', { replace: true })
          return
        }
        if (chat.activeProjectId !== projectId || chat.activeConversationId)
          chat.startNewProjectConversation(projectId)
      } else if (chat.activeConversationId || chat.activeProjectId) chat.startNewConversation()
    }
    void apply()
  }, [
    active,
    initialLoading,
    location.pathname,
    location.search,
    params.projectId,
    params.conversationId,
    projects,
    chat.conversations
  ])

  function closeSidebar() {
    if (isMobile) setSidebarOpen(false)
  }
  async function startNew() {
    routeSequenceRef.current += 1
    setNewConversationVersion((value) => value + 1)
    chat.startNewConversation()
    await navigate('/chat')
    closeSidebar()
  }
  async function startProjectNew(id: string) {
    routeSequenceRef.current += 1
    setNewConversationVersion((value) => value + 1)
    chat.startNewProjectConversation(id)
    await navigate(`/chat/${id}`)
    closeSidebar()
  }
  async function selectConversation(id: string) {
    routeSequenceRef.current += 1
    const conversation = chat.conversations.find((item) => item.id === id)
    await navigate(routeForConversation(conversation, id))
    setSearchOpen(false)
    closeSidebar()
  }
  async function deleteConversation(id: string) {
    const active = chat.activeConversationId === id
    await chat.deleteConversation(id)
    if (active) await navigate('/chat', { replace: true })
    closeSidebar()
  }
  async function moveConversation(id: string, projectId: string | null) {
    const updated = await chat.moveConversationToProject(id, projectId)
    if (chat.activeConversationId === id)
      await navigate(routeForConversation(updated, id), { replace: true })
    void message.success(projectId ? t('ui.movedToProject') : t('ui.removedFromProject'))
  }

  function openProject(project?: ProjectRecord) {
    setEditingProject(project ?? null)
    setProjectDialogOpen(true)
  }
  async function submitProject(input: CreateProjectInput) {
    setSubmittingProject(true)
    try {
      if (editingProject) {
        await updateProject(editingProject.id, input)
        void message.success(t('ui.projectUpdated'))
      } else {
        const project = await createProject(input)
        void message.success(t('ui.projectCreated'))
        await startProjectNew(project.id)
      }
      setProjectDialogOpen(false)
      setEditingProject(null)
    } finally {
      setSubmittingProject(false)
    }
  }
  async function removeProject(id: string) {
    await deleteProject(id)
    await chat.loadConversations(true)
    if (chat.activeProjectId === id) await startNew()
    void message.success(t('ui.projectDeleted'))
  }
  async function updateProjectPrompt(id: string, prompt: string) {
    if (savingProjectPrompt) return false
    setSavingProjectPrompt(true)
    try {
      await updateProject(id, { prompt })
      void message.success(t('ui.projectInstructionsUpdated'))
      return true
    } catch {
      void message.error(t('ui.failedToSaveProjectInstructionsPleaseTryAgainLater'))
      return false
    } finally {
      setSavingProjectPrompt(false)
    }
  }
  async function send(content: string, files: UploadedFile[], deepThinking: boolean) {
    const creatingConversation = !chat.activeConversationId
    if (creatingConversation) creatingConversationRef.current = true
    try {
      const result = await chat.sendMessage(
        content,
        files.map((file) => file.id),
        files.map((file) => ({
          id: file.id,
          name: file.originalName,
          storageKey: file.storageKey,
          kind: file.kind,
          size: file.size
        })),
        selectedKnowledgeBaseId || undefined,
        deepThinking
      )
      if (!result.accepted) {
        setRestoreRequest({ id: Date.now(), content, files })
      }
      return result.accepted
    } finally {
      if (creatingConversation && !useChatStore.getState().activeConversationId) {
        creatingConversationRef.current = false
      }
    }
  }
  async function prompt(content: string) {
    if (submittingPrompt) return
    setSubmittingPrompt(content)
    try {
      await send(content, [], localStorage.getItem(DEEP_THINKING_STORAGE_KEY) === 'true')
    } finally {
      setSubmittingPrompt('')
    }
  }
  async function setModel(id: string) {
    try {
      const model = await updatePreferredModel({ modelId: id })
      modelPreferences.setSelectedModelId(model.id)
      void message.success(t('ui.modelSwitched'))
    } catch {
      void modelPreferences.loadModelPreferences(true)
      void message.error(t('ui.failedToSwitchModels'))
    }
  }
  async function setSpeech(id: string) {
    try {
      const style = await updateSpeechStyle(id)
      modelPreferences.setSelectedSpeechStyleId(style.id)
      setSpeechStyle(style.id)
      void message.success(t('ui.responseStyleUpdated'))
    } catch {
      modelPreferences.setSelectedSpeechStyleId(user?.speechStyle || 'default')
    }
  }
  function navigateFromSidebar(path: string) {
    void navigate(path)
    closeSidebar()
  }

  if (initialLoading) return <ChatStartupSkeleton />
  return (
    <div className="chat-layout">
      <ChatSidebar
        mobile={isMobile}
        open={isSidebarOpen}
        knowledgeBaseCount={knowledgeBases.length}
        isAdmin={Boolean(user?.isAdmin)}
        projects={projects}
        projectsLoading={projectsLoading}
        conversations={chat.conversations}
        conversationsLoading={chat.isLoadingConversations}
        activeConversationId={chat.activeConversationId}
        activeProjectId={chat.activeProjectId}
        newConversationActive={!chat.activeConversationId && !chat.activeProjectId}
        userInitial={(user?.username || 'U').charAt(0).toUpperCase()}
        userDisplayName={user?.username || t('ui.user')}
        onClose={closeSidebar}
        onCreateConversation={() => void startNew()}
        onCreateProject={() => openProject()}
        onSelectProject={(id) => void startProjectNew(id)}
        onEditProject={openProject}
        onDeleteProject={(id) => void removeProject(id)}
        onCreateProjectConversation={(id) => void startProjectNew(id)}
        onSearch={() => setSearchOpen(true)}
        onNavigate={navigateFromSidebar}
        onSelectConversation={(id) => void selectConversation(id)}
        onTogglePin={(id, pinned) => void chat.toggleConversationPin(id, pinned)}
        onRename={(id, title) => void chat.renameConversation(id, title)}
        onDelete={(id) => void deleteConversation(id)}
        onMove={(id, projectId) => void moveConversation(id, projectId)}
        onSettings={() => setSettingsOpen(true)}
      />
      <ChatMainPanel
        mobile={isMobile}
        routeKey={routeKey}
        messages={chat.messages}
        loading={chat.isLoadingMessages}
        streaming={chat.isSending}
        stopping={chat.isStopping}
        thinkingText={chat.streamingStatusText}
        streamingStatus={chat.streamingStatus}
        activeConversation={activeConversation}
        activeProject={activeProject}
        projectConversations={activeProjectConversations}
        projectPromptSaving={savingProjectPrompt}
        projects={projects}
        submittingPrompt={submittingPrompt}
        restoreRequest={restoreRequest}
        onOpenSidebar={() => setSidebarOpen(true)}
        onCreateConversation={() => void startNew()}
        onSelectProject={(id) => void startProjectNew(id)}
        onSelectConversation={(id) => void selectConversation(id)}
        onUpdateProjectPrompt={updateProjectPrompt}
        onPrompt={(content) => void prompt(content)}
        onSend={send}
        onRestoreConsumed={() => setRestoreRequest(null)}
        onStop={() => void chat.stopStreaming()}
        onEditMessage={(id, content) => void chat.updateMessage(id, content)}
        onDeleteMessage={(id) => void chat.deleteMessage(id)}
        onTogglePin={(id, pinned) => void chat.toggleConversationPin(id, pinned)}
        onRename={(id, title) => void chat.renameConversation(id, title)}
        onDeleteConversation={(id) => void deleteConversation(id)}
        onMove={(id, projectId) => void moveConversation(id, projectId)}
      />
      <ConversationSearchDialog
        open={searchOpen}
        conversations={chat.conversations}
        onClose={() => setSearchOpen(false)}
        onSelect={(id) => void selectConversation(id)}
      />
      <ProjectDialog
        open={projectDialogOpen}
        project={editingProject}
        submitting={submittingProject}
        onClose={() => setProjectDialogOpen(false)}
        onSubmit={(input) => void submitProject(input)}
      />
      <ChatSettingsDialog
        open={settingsOpen}
        themeMode={themeMode}
        models={modelPreferences.availableModels}
        selectedModelId={modelPreferences.selectedModelId}
        loadingModels={modelPreferences.isLoadingModels}
        speechStyles={modelPreferences.availableSpeechStyles}
        selectedSpeechStyleId={modelPreferences.selectedSpeechStyleId}
        loadingSpeechStyles={modelPreferences.isLoadingSpeechStyles}
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
    </div>
  )
}
