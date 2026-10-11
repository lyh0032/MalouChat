import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  LoadingOutlined,
  MoreOutlined,
  PlusOutlined
} from '@ant-design/icons'
import Sortable from 'sortablejs'

import type { ConversationSummary } from '../../types/chat'
import type { ProjectRecord } from '../../types/project'
import IconParkPin from '../icons/IconParkPin'
import MobileActionSheet, { MobileActionSheetItem } from '../common/MobileActionSheet'
import AppSidebarShell from '../navigation/AppSidebarShell'
import ConversationActions from './ConversationActions'
import ProjectIcon from './ProjectIcon'
import { isCoarsePointerDevice } from '../../utils/pointer-device'
import {
  getDraggedConversation,
  setDraggedConversation,
  shouldMoveConversationProject
} from '../../utils/project-dnd'

import './ChatSidebar.css'

type SortableOptionsWithPointerSupport = Sortable.Options & {
  supportPointer?: boolean
}

type SortableEventWithOriginalEvent = Sortable.SortableEvent & {
  originalEvent?: Event
}

const MOBILE_DRAG_DELAY = 1000
const MOBILE_SCROLL_CANCEL_DISTANCE = 10

type Props = {
  mobile: boolean
  open: boolean
  knowledgeBaseCount: number
  isAdmin: boolean
  projects: ProjectRecord[]
  projectsLoading: boolean
  conversations: ConversationSummary[]
  conversationsLoading: boolean
  activeConversationId: string
  activeProjectId: string
  newConversationActive: boolean
  userInitial: string
  userDisplayName: string
  onClose: () => void
  onCreateConversation: () => void
  onCreateProject: () => void
  onSelectProject: (id: string) => void
  onEditProject: (project: ProjectRecord) => void
  onDeleteProject: (id: string) => void
  onCreateProjectConversation: (id: string) => void
  onSearch: () => void
  onNavigate: (path: string) => void
  onSelectConversation: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, projectId: string | null) => void
  onSettings: () => void
}

type ConversationListProps = {
  className: string
  projectId: string | null
  nested?: boolean
  mobile: boolean
  loading?: boolean
  conversations: ConversationSummary[]
  activeConversationId: string
  projects: ProjectRecord[]
  onSelect: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, projectId: string | null) => void
}

const CONVERSATION_DRAG_CLASSES = [
  'conversation-drag-chosen',
  'conversation-drag-ghost',
  'conversation-dragging'
]

function clearConversationDragClasses(item: HTMLElement) {
  const clear = () => {
    item.classList.remove(...CONVERSATION_DRAG_CLASSES)
    item.removeAttribute('draggable')
    item.style.removeProperty('transform')
    item.style.removeProperty('will-change')
  }
  clear()
  window.requestAnimationFrame(clear)
}

function ConversationList(props: ConversationListProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const suppressSelectUntilRef = useRef(0)
  const usesLongPressDragRef = useRef(false)
  const onMoveRef = useRef(props.onMove)
  onMoveRef.current = props.onMove

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const touch = isCoarsePointerDevice() || (props.mobile && navigator.maxTouchPoints > 0)
    usesLongPressDragRef.current = touch
    let touchDragging = false
    let ownsActiveDrag = false
    let touchDropTarget: { element: HTMLElement; projectId: string | null } | null = null

    const clearTouchDropTarget = () => {
      touchDropTarget?.element.classList.remove('conversation-drop-target--touch-active')
      touchDropTarget = null
    }
    const updateTouchDropTarget = (clientX: number, clientY: number) => {
      if (!touchDragging) return
      const target =
        document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>('[data-conversation-drop-target]') ?? null
      const dragged = getDraggedConversation()
      const projectId = target?.dataset.projectId || null
      const canDrop = Boolean(
        target &&
        dragged?.id &&
        shouldMoveConversationProject({
          currentProjectId: dragged.projectId,
          targetProjectId: projectId
        })
      )
      if (target === touchDropTarget?.element && canDrop) return
      clearTouchDropTarget()
      if (!target || !canDrop) return
      target.classList.add('conversation-drop-target--touch-active')
      touchDropTarget = { element: target, projectId }
    }
    const handleTouchMove = (event: TouchEvent) => {
      const point = event.touches[0]
      if (point) updateTouchDropTarget(point.clientX, point.clientY)
    }

    const sortable = Sortable.create(root, {
      group: { name: 'chat-conversations', pull: 'clone', put: false },
      draggable: '.conversation-item',
      filter: '.conversation-item-right, .conversation-item-right *',
      preventOnFilter: false,
      sort: false,
      animation: 140,
      forceFallback: touch,
      fallbackOnBody: touch,
      supportPointer: !touch,
      delay: touch ? MOBILE_DRAG_DELAY : 0,
      delayOnTouchOnly: false,
      touchStartThreshold: touch ? MOBILE_SCROLL_CANCEL_DISTANCE : 1,
      fallbackTolerance: touch ? 3 : 4,
      emptyInsertThreshold: 20,
      ghostClass: 'conversation-drag-ghost',
      chosenClass: 'conversation-drag-chosen',
      dragClass: 'conversation-dragging',
      fallbackClass: 'conversation-drag-fallback',
      onChoose() {
        if (touch) suppressSelectUntilRef.current = Date.now() + 1500
      },
      onStart(event) {
        const item = event.item as HTMLElement
        ownsActiveDrag = true
        suppressSelectUntilRef.current = Date.now() + 1200
        setDraggedConversation({
          id: item.dataset.conversationId || '',
          projectId: item.dataset.projectId || null
        })
        if (touch) {
          touchDragging = true
          document.addEventListener('touchmove', handleTouchMove, { passive: true })
        }
      },
      onEnd(event) {
        suppressSelectUntilRef.current = Date.now() + 450
        const dragged = getDraggedConversation()
        const originalEvent = (event as SortableEventWithOriginalEvent).originalEvent
        const cancelled =
          originalEvent?.type === 'touchcancel' || originalEvent?.type === 'pointercancel'
        if (
          touch &&
          !cancelled &&
          dragged?.id &&
          touchDropTarget &&
          shouldMoveConversationProject({
            currentProjectId: dragged.projectId,
            targetProjectId: touchDropTarget.projectId
          })
        ) {
          onMoveRef.current(dragged.id, touchDropTarget.projectId)
        }
        clearConversationDragClasses(event.item as HTMLElement)
        touchDragging = false
        document.removeEventListener('touchmove', handleTouchMove)
        clearTouchDropTarget()
        document
          .querySelectorAll<HTMLElement>('.conversation-drop-target--active')
          .forEach((target) => target.classList.remove('conversation-drop-target--active'))
        window.setTimeout(() => {
          if (!ownsActiveDrag) return
          ownsActiveDrag = false
          setDraggedConversation(null)
        }, 0)
      },
      onUnchoose(event) {
        clearConversationDragClasses(event.item as HTMLElement)
        if (touch && !touchDragging) clearTouchDropTarget()
      }
    } as SortableOptionsWithPointerSupport)

    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      clearTouchDropTarget()
      root.querySelectorAll<HTMLElement>('.conversation-item').forEach(clearConversationDragClasses)
      if (ownsActiveDrag) setDraggedConversation(null)
      sortable.destroy()
    }
  }, [props.mobile])

  return (
    <div ref={rootRef} data-project-id={props.projectId ?? ''} className={props.className}>
      {props.loading ? (
        <div className="chat-sidebar-list-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : (
        props.conversations.map((conversation) => (
          <div
            key={conversation.id}
            data-conversation-id={conversation.id}
            data-project-id={conversation.projectId ?? ''}
            className={`conversation-item${props.nested ? ' conversation-item--nested' : ''}${props.activeConversationId === conversation.id ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              if (!event.currentTarget.contains(event.target as Node)) return
              if (Date.now() >= suppressSelectUntilRef.current) props.onSelect(conversation.id)
            }}
            onContextMenu={(event) => {
              if (usesLongPressDragRef.current) event.preventDefault()
            }}
            onKeyDown={(event) => {
              if (!event.currentTarget.contains(event.target as Node)) return
              if (event.key === 'Enter') props.onSelect(conversation.id)
            }}
          >
            <span className="conversation-item-left">
              {conversation.isGenerating ? <LoadingOutlined spin /> : null}
              <span>{conversation.title}</span>
            </span>
            <span className="conversation-item-right">
              {conversation.isPinned ? (
                <Button
                  className="conversation-pin-button"
                  type="text"
                  size="small"
                  icon={<IconParkPin />}
                  aria-label="取消置顶"
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onTogglePin(conversation.id, false)
                  }}
                />
              ) : null}
              <ConversationActions
                conversation={conversation}
                projects={props.projects}
                mobile={props.mobile}
                onTogglePin={props.onTogglePin}
                onRename={props.onRename}
                onDelete={props.onDelete}
                onMove={props.onMove}
              />
            </span>
          </div>
        ))
      )}
    </div>
  )
}

export default function ChatSidebar(props: Props) {
  const { modal } = AntApp.useApp()
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false)
  const [mobileProject, setMobileProject] = useState<ProjectRecord | null>(null)
  const dragOverTargetRef = useRef<HTMLElement | null>(null)
  const onMoveRef = useRef(props.onMove)
  onMoveRef.current = props.onMove
  const normalConversations = useMemo(
    () => props.conversations.filter((conversation) => !conversation.projectId),
    [props.conversations]
  )
  const conversationsByProject = useMemo(() => {
    const grouped = new Map<string, ConversationSummary[]>()
    props.conversations.forEach((conversation) => {
      if (!conversation.projectId) return
      const list = grouped.get(conversation.projectId) ?? []
      list.push(conversation)
      grouped.set(conversation.projectId, list)
    })
    return grouped
  }, [props.conversations])

  function handleDropTargetDragOver(event: React.DragEvent<HTMLElement>, projectId: string | null) {
    const dragged = getDraggedConversation()
    if (
      !dragged?.id ||
      !shouldMoveConversationProject({
        currentProjectId: dragged.projectId,
        targetProjectId: projectId
      })
    )
      return
    event.preventDefault()
    if (dragOverTargetRef.current !== event.currentTarget) {
      dragOverTargetRef.current?.classList.remove('conversation-drop-target--active')
      event.currentTarget.classList.add('conversation-drop-target--active')
      dragOverTargetRef.current = event.currentTarget
    }
  }

  function handleDropTarget(event: React.DragEvent<HTMLElement>, projectId: string | null) {
    event.preventDefault()
    const dragged = getDraggedConversation()
    dragOverTargetRef.current?.classList.remove('conversation-drop-target--active')
    dragOverTargetRef.current = null
    if (
      dragged?.id &&
      shouldMoveConversationProject({
        currentProjectId: dragged.projectId,
        targetProjectId: projectId
      })
    ) {
      onMoveRef.current(dragged.id, projectId)
    }
  }

  function confirmDeleteProject(project: ProjectRecord) {
    modal.confirm({
      title: '删除项目',
      content: `删除「${project.title}」会同时删除项目下的所有会话，确认继续吗？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => props.onDeleteProject(project.id)
    })
  }

  function projectMenu(project: ProjectRecord): MenuProps['items'] {
    return [
      { key: 'new', label: '新建对话' },
      { key: 'edit', label: '编辑' },
      { type: 'divider' },
      { key: 'delete', label: '删除', danger: true }
    ]
  }

  function projectAction(key: string, project: ProjectRecord) {
    if (key === 'new') props.onCreateProjectConversation(project.id)
    if (key === 'edit') props.onEditProject(project)
    if (key === 'delete') confirmDeleteProject(project)
  }

  return (
    <>
      <AppSidebarShell
        mobile={props.mobile}
        open={props.open}
        activeItem={props.newConversationActive ? 'new-conversation' : null}
        knowledgeBaseCount={props.knowledgeBaseCount}
        isAdmin={props.isAdmin}
        userInitial={props.userInitial}
        userDisplayName={props.userDisplayName}
        onClose={props.onClose}
        onCreateConversation={props.onCreateConversation}
        onSearch={props.onSearch}
        onNavigate={props.onNavigate}
        onSettings={props.onSettings}
      >
        <section className="chat-sidebar-group">
          <header>
            <button
              className="chat-sidebar-collapse-trigger"
              type="button"
              aria-expanded={!projectsCollapsed}
              onClick={() => setProjectsCollapsed((value) => !value)}
            >
              <DownOutlined className={projectsCollapsed ? 'is-collapsed' : ''} />
              <span>项目</span>
            </button>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label="新建项目"
              onClick={props.onCreateProject}
            />
          </header>
          <div
            className={`chat-sidebar-section-content${projectsCollapsed ? ' is-collapsed' : ''}`}
            aria-hidden={projectsCollapsed}
          >
            <div className="chat-sidebar-section-content-inner">
              {props.projectsLoading ? (
                <div className="chat-sidebar-list-skeleton" aria-hidden="true">
                  <span />
                  <span />
                </div>
              ) : (
                props.projects.map((project) => {
                  const projectPageActive =
                    props.activeProjectId === project.id && !props.activeConversationId
                  return (
                    <div
                      key={project.id}
                      data-conversation-drop-target="project"
                      data-project-id={project.id}
                      className="project-block"
                      onDragEnter={(event) => handleDropTargetDragOver(event, project.id)}
                      onDragOver={(event) => handleDropTargetDragOver(event, project.id)}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          event.currentTarget.classList.remove('conversation-drop-target--active')
                          if (dragOverTargetRef.current === event.currentTarget)
                            dragOverTargetRef.current = null
                        }
                      }}
                      onDrop={(event) => handleDropTarget(event, project.id)}
                    >
                      <div
                        className={`project-item${projectPageActive ? ' is-active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => props.onSelectProject(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') props.onSelectProject(project.id)
                        }}
                      >
                        <span className="project-item-title">
                          <i style={{ color: project.iconColor }}>
                            <ProjectIcon name={project.icon} />
                          </i>
                          <strong>{project.title}</strong>
                        </span>
                        {props.mobile ? (
                          <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            aria-label="更多项目操作"
                            onClick={(event) => {
                              event.stopPropagation()
                              setMobileProject(project)
                            }}
                          />
                        ) : (
                          <Dropdown
                            trigger={['click']}
                            menu={{
                              items: projectMenu(project),
                              onClick: ({ key, domEvent }) => {
                                domEvent.stopPropagation()
                                projectAction(key, project)
                              }
                            }}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<MoreOutlined />}
                              aria-label="更多项目操作"
                              onClick={(event) => event.stopPropagation()}
                            />
                          </Dropdown>
                        )}
                      </div>
                      <ConversationList
                        className="project-conversations"
                        projectId={project.id}
                        nested
                        mobile={props.mobile}
                        conversations={conversationsByProject.get(project.id) ?? []}
                        activeConversationId={props.activeConversationId}
                        projects={props.projects}
                        onSelect={props.onSelectConversation}
                        onTogglePin={props.onTogglePin}
                        onRename={props.onRename}
                        onDelete={props.onDelete}
                        onMove={props.onMove}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>

        <section
          data-conversation-drop-target="normal"
          data-project-id=""
          className="chat-sidebar-group chat-sidebar-conversations"
          onDragEnter={(event) => handleDropTargetDragOver(event, null)}
          onDragOver={(event) => handleDropTargetDragOver(event, null)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              event.currentTarget.classList.remove('conversation-drop-target--active')
              if (dragOverTargetRef.current === event.currentTarget)
                dragOverTargetRef.current = null
            }
          }}
          onDrop={(event) => handleDropTarget(event, null)}
        >
          <header>
            <button
              className="chat-sidebar-collapse-trigger"
              type="button"
              aria-expanded={!conversationsCollapsed}
              onClick={() => setConversationsCollapsed((value) => !value)}
            >
              <DownOutlined className={conversationsCollapsed ? 'is-collapsed' : ''} />
              <span>对话</span>
            </button>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label="新建对话"
              onClick={props.onCreateConversation}
            />
          </header>
          <div
            className={`chat-sidebar-section-content${conversationsCollapsed ? ' is-collapsed' : ''}`}
            aria-hidden={conversationsCollapsed}
          >
            <div className="chat-sidebar-section-content-inner">
              <ConversationList
                className="normal-conversations-dropzone"
                projectId={null}
                mobile={props.mobile}
                loading={props.conversationsLoading}
                conversations={normalConversations}
                activeConversationId={props.activeConversationId}
                projects={props.projects}
                onSelect={props.onSelectConversation}
                onTogglePin={props.onTogglePin}
                onRename={props.onRename}
                onDelete={props.onDelete}
                onMove={props.onMove}
              />
            </div>
          </div>
        </section>
      </AppSidebarShell>

      <MobileActionSheet
        open={Boolean(mobileProject)}
        title={mobileProject?.title ?? ''}
        onClose={() => setMobileProject(null)}
      >
        <MobileActionSheetItem
          icon={<PlusOutlined />}
          onClick={() => {
            if (mobileProject) props.onCreateProjectConversation(mobileProject.id)
            setMobileProject(null)
          }}
        >
          新建对话
        </MobileActionSheetItem>
        <MobileActionSheetItem
          icon={<EditOutlined />}
          onClick={() => {
            if (mobileProject) props.onEditProject(mobileProject)
            setMobileProject(null)
          }}
        >
          编辑
        </MobileActionSheetItem>
        <MobileActionSheetItem
          danger
          icon={<DeleteOutlined />}
          onClick={() => {
            if (mobileProject) confirmDeleteProject(mobileProject)
            setMobileProject(null)
          }}
        >
          删除
        </MobileActionSheetItem>
      </MobileActionSheet>
    </>
  )
}
