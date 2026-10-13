import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { DownOutlined, MenuOutlined, PlusOutlined } from '@ant-design/icons'

import type { UploadedFile } from '../../api/file'
import type { ConversationSummary, Message, StreamAssistantStatus } from '../../types/chat'
import type { ProjectRecord } from '../../types/project'
import ConversationActions from './ConversationActions'
import { ChatDraftSkeleton } from './ChatLoadingSkeletons'
import MessageComposer from './MessageComposer'
import MessageList from './MessageList'
import ProjectHome from './ProjectHome'
import ProjectIcon from './ProjectIcon'
import QuestionDots from './QuestionDots'

import './ChatMainPanel.css'

type Props = {
  mobile: boolean
  routeKey: string
  messages: Message[]
  loading: boolean
  streaming: boolean
  stopping: boolean
  thinkingText: string
  streamingStatus: StreamAssistantStatus | null
  activeConversation: ConversationSummary | null
  activeProject: ProjectRecord | null
  projectConversations: ConversationSummary[]
  projectPromptSaving: boolean
  projects: ProjectRecord[]
  submittingPrompt: string
  restoreRequest: { id: number; content: string; files: UploadedFile[] } | null
  onOpenSidebar: () => void
  onCreateConversation: () => void
  onSelectProject: (id: string) => void
  onSelectConversation: (id: string) => void
  onUpdateProjectPrompt: (id: string, prompt: string) => Promise<boolean>
  onPrompt: (content: string) => void
  onSend: (content: string, files: UploadedFile[], deepThinking: boolean) => Promise<boolean>
  onRestoreConsumed: () => void
  onStop: () => void
  onEditMessage: (id: string, content: string) => void
  onDeleteMessage: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onRename: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  onMove: (id: string, projectId: string | null) => void
}

export default function ChatMainPanel(props: Props) {
  useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const autoScrollRef = useRef(true)
  const [draftLoading, setDraftLoading] = useState(false)
  const activeRouteKeyRef = useRef(props.routeKey)

  useEffect(() => {
    activeRouteKeyRef.current = props.routeKey
    setDraftLoading(false)
  }, [props.routeKey])

  const handleDraftLoading = useCallback(
    (loading: boolean) => {
      if (activeRouteKeyRef.current === props.routeKey) setDraftLoading(loading)
    },
    [props.routeKey]
  )

  const messageSignature = props.messages.length
    ? `${props.messages.length}:${props.messages.at(-1)?.id}:${props.messages.at(-1)?.content.length}:${props.messages.at(-1)?.reasoningContent?.length ?? 0}`
    : '0'
  const projectHomeVisible = Boolean(
    props.activeProject && !props.activeConversation && props.messages.length === 0
  )

  useEffect(() => {
    if (!autoScrollRef.current) return
    requestAnimationFrame(() => {
      const element = scrollRef.current
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'auto' })
    })
  }, [messageSignature])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    autoScrollRef.current = true
    setShowScrollBottom(false)
  }, [props.routeKey])

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    autoScrollRef.current = distance < 80
    setShowScrollBottom(distance > 100)
  }

  function scrollBottom() {
    const element = scrollRef.current
    if (!element) return
    autoScrollRef.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  }

  return (
    <main className="chat-main-panel">
      <header className="chat-main-header">
        <div className="chat-main-header-left">
          {props.mobile ? (
            <Button
              className="chat-layout-icon-button"
              shape="circle"
              icon={<MenuOutlined />}
              aria-label={t('ui.openMenu')}
              onClick={props.onOpenSidebar}
            />
          ) : null}
          {props.activeProject && props.activeConversation ? (
            <Tooltip title={t('ui.backToProjectValue', { v0: props.activeProject.title })}>
              <button
                className="chat-project-context"
                type="button"
                aria-label={t('ui.backToProjectValue', { v0: props.activeProject.title })}
                onClick={() => props.onSelectProject(props.activeProject!.id)}
              >
                <i style={{ color: props.activeProject.iconColor }}>
                  <ProjectIcon name={props.activeProject.icon} />
                </i>
              </button>
            </Tooltip>
          ) : null}
        </div>
        <div className="chat-main-header-actions">
          {props.mobile ? (
            <Button
              className="chat-layout-icon-button"
              shape="circle"
              icon={<PlusOutlined />}
              aria-label={t('ui.newChat')}
              onClick={props.onCreateConversation}
            />
          ) : null}
          {props.activeConversation ? (
            <ConversationActions
              conversation={props.activeConversation}
              projects={props.projects}
              mobile={props.mobile}
              onTogglePin={props.onTogglePin}
              onRename={props.onRename}
              onDelete={props.onDeleteConversation}
              onMove={props.onMove}
            />
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="chat-main-scroll" onScroll={handleScroll}>
        {projectHomeVisible && props.activeProject ? (
          <ProjectHome
            project={props.activeProject}
            conversations={props.projectConversations}
            savingPrompt={props.projectPromptSaving}
            onSelectConversation={props.onSelectConversation}
            onUpdatePrompt={props.onUpdateProjectPrompt}
          />
        ) : (
          <MessageList
            messages={props.messages}
            loading={props.loading}
            streaming={props.streaming}
            locked={props.streaming || props.stopping}
            thinkingText={props.thinkingText}
            streamingStatus={props.streamingStatus}
            submittingPrompt={props.submittingPrompt}
            onPrompt={props.onPrompt}
            onEdit={props.onEditMessage}
            onDelete={props.onDeleteMessage}
          />
        )}
      </div>
      {!props.loading && !projectHomeVisible ? <QuestionDots messages={props.messages} /> : null}

      <div className="chat-composer-positioner">
        {showScrollBottom ? (
          <Button
            className="chat-layout-scroll-bottom-positioner"
            shape="circle"
            icon={<DownOutlined />}
            aria-label={t('ui.scrollToBottom')}
            onClick={scrollBottom}
          />
        ) : null}
        <MessageComposer
          key={props.routeKey}
          loading={props.streaming || props.stopping}
          canStop={props.streaming || props.stopping}
          conversationId={props.activeConversation?.id ?? ''}
          draftEnabled={!props.activeConversation && !props.activeProject}
          routeKey={props.routeKey}
          restoreRequest={props.restoreRequest}
          onSubmit={props.onSend}
          onRestoreConsumed={props.onRestoreConsumed}
          onCancel={props.onStop}
          onDraftLoading={handleDraftLoading}
        />
      </div>

      {draftLoading ? <ChatDraftSkeleton /> : null}
    </main>
  )
}
