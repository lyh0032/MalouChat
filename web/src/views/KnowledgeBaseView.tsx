import { localizeErrorMessage } from '../i18n/errors'
import { useTranslation } from 'react-i18next'
import { t, getUiLanguage } from '../i18n'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  App as AntApp,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Segmented,
  Spin
} from 'antd'
import type { MenuProps } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LoadingOutlined,
  MoreOutlined,
  PlusOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import {
  fetchKnowledgeBaseMembers,
  inviteKnowledgeBaseMembers,
  leaveKnowledgeBase,
  removeKnowledgeBaseMember,
  updateKnowledgeBaseVisibility
} from '../api/knowledge-base'
import { searchUsers } from '../api/user'
import KnowledgeBaseDetailModal from '../components/knowledge/KnowledgeBaseDetailModal'
import KnowledgeBaseEditorModal from '../components/knowledge/KnowledgeBaseEditorModal'
import ManagementHeaderActions from '../components/management/ManagementHeaderActions'
import ManagementSidebar from '../components/management/ManagementSidebar'
import ManagementSidebarToggle from '../components/management/ManagementSidebarToggle'
import { useMobile } from '../hooks/useMobile'
import { getLastChatRoute } from '../router/chat-route-cache'
import { useAuthStore } from '../stores/auth'
import { useKnowledgeBaseStore } from '../stores/knowledge-base'
import type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseMember,
  KnowledgeBaseRecord,
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility
} from '../types/knowledge-base'
import type { UserSearchResult } from '../types/user'

import './KnowledgeBaseView.css'
import '../components/management/ManagementPageLayout.css'

type StatusFilter = 'all' | 'completed' | 'processing' | 'failed'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getUiLanguage(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatSize(bytes: number | null) {
  if (bytes == null) return t('ui.noAttachment')
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusIcon(status: KnowledgeBaseStatus): ReactNode {
  if (status === 'completed') return <CheckCircleOutlined />
  if (status === 'failed') return <ExclamationCircleOutlined />
  if (status === 'processing') return <LoadingOutlined spin />
  return <ClockCircleOutlined />
}

export default function KnowledgeBaseView() {
  const statusOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: t('ui.all'), value: 'all' },
    { label: t('ui.completed'), value: 'completed' },
    { label: t('ui.processing'), value: 'processing' },
    { label: t('ui.failed'), value: 'failed' }
  ]
  const statusLabels: Record<KnowledgeBaseStatus, string> = {
    queued: t('ui.queued'),
    processing: t('ui.processing'),
    completed: t('ui.completed'),
    failed: t('ui.processingFailed')
  }

  useTranslation()
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const isMobile = useMobile()
  const userType = useAuthStore((state) => state.user?.type)
  const knowledgeBases = useKnowledgeBaseStore((state) => state.knowledgeBases)
  const isLoading = useKnowledgeBaseStore((state) => state.isLoading)
  const isCreating = useKnowledgeBaseStore((state) => state.isCreating)
  const loadKnowledgeBases = useKnowledgeBaseStore((state) => state.loadKnowledgeBases)
  const createKnowledgeBase = useKnowledgeBaseStore((state) => state.createKnowledgeBase)
  const updateKnowledgeBase = useKnowledgeBaseStore((state) => state.updateKnowledgeBase)
  const deleteKnowledgeBase = useKnowledgeBaseStore((state) => state.deleteKnowledgeBase)
  const replaceKnowledgeBase = useKnowledgeBaseStore((state) => state.replaceKnowledgeBase)
  const removeKnowledgeBaseLocally = useKnowledgeBaseStore(
    (state) => state.removeKnowledgeBaseLocally
  )
  const markConversationBindingsDirty = useKnowledgeBaseStore(
    (state) => state.markConversationBindingsDirty
  )
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editorTarget, setEditorTarget] = useState<'create' | string | null>(null)
  const [detailId, setDetailId] = useState('')
  const [teamKnowledgeBaseId, setTeamKnowledgeBaseId] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [userSearchKeyword, setUserSearchKeyword] = useState('')
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([])
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([])
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [teamMembers, setTeamMembers] = useState<KnowledgeBaseMember[]>([])
  const [teamMembersLoading, setTeamMembersLoading] = useState(false)

  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    void loadKnowledgeBases(false, true)
  }, [loadKnowledgeBases])

  const stats = useMemo(() => {
    const completed = knowledgeBases.filter((item) => item.processingStatus === 'completed').length
    const processing = knowledgeBases.filter(
      (item) => item.processingStatus === 'queued' || item.processingStatus === 'processing'
    ).length
    const failed = knowledgeBases.filter((item) => item.processingStatus === 'failed').length
    return [
      { label: t('ui.total'), count: knowledgeBases.length },
      { label: t('ui.ready'), count: completed },
      { label: t('ui.processing'), count: processing },
      { label: t('ui.failed'), count: failed }
    ]
  }, [knowledgeBases])

  const filteredKnowledgeBases = useMemo(() => {
    if (statusFilter === 'all') return knowledgeBases
    if (statusFilter === 'processing') {
      return knowledgeBases.filter(
        (item) => item.processingStatus === 'queued' || item.processingStatus === 'processing'
      )
    }
    return knowledgeBases.filter((item) => item.processingStatus === statusFilter)
  }, [knowledgeBases, statusFilter])

  const editingKnowledgeBase =
    editorTarget && editorTarget !== 'create'
      ? (knowledgeBases.find((item) => item.id === editorTarget) ?? null)
      : null
  const detailKnowledgeBase = knowledgeBases.find((item) => item.id === detailId) ?? null
  const activeTeamKnowledgeBase =
    knowledgeBases.find((item) => item.id === teamKnowledgeBaseId) ?? null

  function returnToChat() {
    navigate(getLastChatRoute())
  }

  function openCreateEditor() {
    if (userType === 'guest') {
      void message.info(t('ui.signInOrRegisterToCreateAKnowledgeBaseGuestAccounts'))
      return
    }

    setEditorTarget('create')
  }

  async function submitKnowledgeBase(input: CreateKnowledgeBaseInput) {
    if (editingKnowledgeBase) {
      const record = await updateKnowledgeBase(editingKnowledgeBase.id, input)
      setEditorTarget(null)
      setDetailId(record.id)
      void message.success(t('ui.knowledgeBaseUpdatedSyncingTheIndex'))
      return
    }

    const record = await createKnowledgeBase(input)
    setEditorTarget(null)
    setDetailId(record.id)
    void message.success(t('ui.knowledgeBaseCreatedProcessingInTheBackground'))
  }

  function confirmDelete(record: KnowledgeBaseRecord) {
    modal.confirm({
      title: t('ui.deleteKnowledgeBase'),
      content: t('ui.deleteThisKnowledgeBaseAndAllItsContentAndAttachments'),
      okText: t('ui.delete'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        await deleteKnowledgeBase(record.id)
        if (detailId === record.id) setDetailId('')
        void message.success(t('ui.knowledgeBaseDeleted'))
      }
    })
  }

  function confirmVisibility(record: KnowledgeBaseRecord, visibility: KnowledgeBaseVisibility) {
    modal.confirm({
      title:
        visibility === 'team'
          ? t('ui.makeThisATeamKnowledgeBase')
          : t('ui.makeThisAPrivateKnowledgeBase'),
      content:
        visibility === 'team'
          ? t('ui.aTeamKnowledgeBaseLetsYouInviteOthersToUseIt')
          : t('ui.makingThisPrivateWillRemoveAllMembersAndUnlinkItFrom'),
      okText: visibility === 'team' ? t('ui.makeTeam') : t('ui.makePrivate'),
      cancelText: t('ui.cancel'),
      async onOk() {
        const updated = await updateKnowledgeBaseVisibility(record.id, visibility)
        replaceKnowledgeBase(updated)
        if (visibility === 'private') markConversationBindingsDirty()
        void message.success(
          visibility === 'team'
            ? t('ui.changedToATeamKnowledgeBase')
            : t('ui.changedToAPrivateKnowledgeBase')
        )
      }
    })
  }

  function openInvite(record: KnowledgeBaseRecord) {
    setTeamKnowledgeBaseId(record.id)
    setUserSearchKeyword('')
    setUserSearchResults([])
    setSelectedInviteUserIds([])
    setInviteOpen(true)
  }

  async function handleSearchUsers() {
    const query = userSearchKeyword.trim()
    if (!query) {
      setUserSearchResults([])
      return
    }
    setUserSearchLoading(true)
    try {
      setUserSearchResults(await searchUsers(query))
    } finally {
      setUserSearchLoading(false)
    }
  }

  async function sendInvitations() {
    if (!activeTeamKnowledgeBase || selectedInviteUserIds.length === 0) return
    setInviteSubmitting(true)
    try {
      const result = await inviteKnowledgeBaseMembers(
        activeTeamKnowledgeBase.id,
        selectedInviteUserIds
      )
      const skippedCount = result.skippedMemberCount + result.skippedInvitationCount
      if (result.createdCount > 0) {
        setInviteOpen(false)
        void message.success(
          skippedCount > 0
            ? t('ui.sentValueInvitationsAndSkippedValueDuplicates', {
                v0: result.createdCount,
                v1: skippedCount
              })
            : t('ui.invitationSent')
        )
      } else {
        void message.warning(t('ui.selectedUsersAreAlreadyMembersOrHavePendingInvitations'))
      }
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function openMembers(record: KnowledgeBaseRecord) {
    setTeamKnowledgeBaseId(record.id)
    setMemberOpen(true)
    setTeamMembersLoading(true)
    try {
      setTeamMembers(await fetchKnowledgeBaseMembers(record.id))
    } finally {
      setTeamMembersLoading(false)
    }
  }

  async function removeMember(member: KnowledgeBaseMember) {
    if (!activeTeamKnowledgeBase) return
    await removeKnowledgeBaseMember(activeTeamKnowledgeBase.id, member.id)
    setTeamMembers((members) => members.filter((item) => item.id !== member.id))
    await loadKnowledgeBases(true, true)
    void message.success(t('ui.memberRemoved'))
  }

  function confirmLeave(record: KnowledgeBaseRecord) {
    modal.confirm({
      title: t('ui.leaveTeamKnowledgeBase'),
      content: t('ui.thisKnowledgeBaseWillBeRemovedFromYourListLeaveIt'),
      okText: t('ui.leave'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        await leaveKnowledgeBase(record.id)
        removeKnowledgeBaseLocally(record.id, true)
        void message.success(t('ui.leftTheTeamKnowledgeBase'))
      }
    })
  }

  function menuItems(record: KnowledgeBaseRecord): MenuProps['items'] {
    if (record.role === 'member') return [{ key: 'leave', label: t('ui.leave'), danger: true }]
    return [
      { key: 'edit', label: t('ui.update') },
      {
        key: record.visibility === 'private' ? 'team' : 'private',
        label: record.visibility === 'private' ? t('ui.makeTeam') : t('ui.makePrivate')
      },
      ...(record.visibility === 'team'
        ? [
            { key: 'invite', label: t('ui.inviteUsers') },
            { key: 'members', label: t('ui.manageMembers') }
          ]
        : []),
      { type: 'divider' },
      { key: 'delete', label: t('ui.delete'), danger: true }
    ]
  }

  function handleMenuAction(key: string, record: KnowledgeBaseRecord) {
    if (key === 'edit') setEditorTarget(record.id)
    if (key === 'team' || key === 'private') confirmVisibility(record, key)
    if (key === 'invite') openInvite(record)
    if (key === 'members') void openMembers(record)
    if (key === 'delete') confirmDelete(record)
    if (key === 'leave') confirmLeave(record)
  }

  return (
    <div className="knowledge-layout">
      <ManagementSidebar
        isMobile={isMobile}
        isOpen={isSidebarOpen}
        activeItem="knowledge-bases"
        summaryTitle={t('ui.knowledgeBaseHub')}
        summaryText={t('counts.knowledgeBases', { count: knowledgeBases.length })}
        icon={<DatabaseOutlined />}
        stats={stats.map((item) => (
          <article key={item.label} className="management-sidebar-stat">
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </article>
        ))}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="knowledge-layout-main">
        <header className="knowledge-layout-header management-page-header">
          <div className="knowledge-layout-header-main management-page-header-main">
            {isMobile ? (
              <ManagementSidebarToggle
                label={t('ui.openSidebar')}
                onClick={() => setSidebarOpen(true)}
              />
            ) : null}
            <h2>{t('ui.knowledgeBaseManagement')}</h2>
          </div>
          <ManagementHeaderActions onCreate={openCreateEditor} />
        </header>

        <section className="knowledge-layout-toolbar">
          <Segmented<StatusFilter>
            block={isMobile}
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <span>{t('counts.items', { count: filteredKnowledgeBases.length })}</span>
        </section>

        <section className="knowledge-layout-content">
          <Spin spinning={isLoading}>
            {!isLoading && knowledgeBases.length === 0 ? (
              <div className="knowledge-layout-state">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('ui.noKnowledgeBasesYet')}
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateEditor}>
                    {t('ui.newKnowledgeBase')}
                  </Button>
                </Empty>
              </div>
            ) : !isLoading && filteredKnowledgeBases.length === 0 ? (
              <div className="knowledge-layout-state">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('ui.noResultsForThisFilter')}
                >
                  <Button onClick={() => setStatusFilter('all')}>{t('ui.viewAll')}</Button>
                </Empty>
              </div>
            ) : (
              <div className="knowledge-layout-grid">
                {filteredKnowledgeBases.map((record) => (
                  <article
                    key={record.id}
                    className="knowledge-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailId(record.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setDetailId(record.id)
                    }}
                  >
                    <div className="knowledge-card-topline">
                      <div className="knowledge-card-badges">
                        <span
                          className={`knowledge-card-badge knowledge-card-badge--${record.visibility}`}
                        >
                          {record.visibility === 'team' ? t('ui.team') : t('ui.private')}
                        </span>
                        <span
                          className={`knowledge-card-badge knowledge-card-badge--${record.role}`}
                        >
                          {record.role === 'owner' ? t('ui.owner') : t('ui.member')}
                        </span>
                      </div>
                      <span
                        className={`knowledge-card-status knowledge-card-status--${record.processingStatus}`}
                        title={statusLabels[record.processingStatus]}
                      >
                        {statusIcon(record.processingStatus)}
                      </span>
                    </div>
                    <h3>{record.title}</h3>
                    <p className="knowledge-card-content">{record.content}</p>
                    <div className="knowledge-card-meta">
                      <span>
                        <FileTextOutlined /> {record.attachmentName || t('ui.textOnly')}
                      </span>
                      <small>{formatSize(record.attachmentSize)}</small>
                    </div>
                    {record.processingStatus === 'failed' && record.processingError ? (
                      <div className="knowledge-card-error">
                        {localizeErrorMessage(record.processingError, 'KNOWLEDGE_BASE_NOT_READY')}
                      </div>
                    ) : null}
                    <footer className="knowledge-card-footer">
                      <time dateTime={record.updatedAt}>
                        {t('dates.updated', { date: formatDate(record.updatedAt) })}
                      </time>
                      <Dropdown
                        trigger={['click']}
                        placement="bottomRight"
                        menu={{
                          items: menuItems(record),
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation()
                            handleMenuAction(key, record)
                          }
                        }}
                      >
                        <Button
                          className="knowledge-card-menu"
                          type="text"
                          shape="circle"
                          icon={<MoreOutlined />}
                          aria-label={t('ui.knowledgeBaseActions')}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Dropdown>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </Spin>
        </section>
      </main>

      <KnowledgeBaseEditorModal
        open={Boolean(editorTarget)}
        loading={isCreating}
        knowledgeBase={editingKnowledgeBase}
        onClose={() => setEditorTarget(null)}
        onSubmit={submitKnowledgeBase}
      />
      <KnowledgeBaseDetailModal
        knowledgeBase={detailKnowledgeBase}
        onClose={() => setDetailId('')}
      />

      <Modal
        closable={{ 'aria-label': t('ui.close') }}
        open={inviteOpen}
        title={t('ui.inviteTeamMembers')}
        width={560}
        centered
        okText={t('ui.sendInvitations')}
        cancelText={t('ui.cancel')}
        confirmLoading={inviteSubmitting}
        okButtonProps={{ disabled: selectedInviteUserIds.length === 0 }}
        onOk={() => void sendInvitations()}
        onCancel={() => setInviteOpen(false)}
      >
        <div className="knowledge-team-dialog">
          <Input.Search
            value={userSearchKeyword}
            loading={userSearchLoading}
            placeholder={t('ui.searchUsernameOrEmail')}
            allowClear
            enterButton={t('ui.search')}
            onChange={(event) => setUserSearchKeyword(event.target.value)}
            onSearch={() => void handleSearchUsers()}
          />
          <Spin spinning={userSearchLoading}>
            {userSearchResults.length ? (
              <Checkbox.Group
                value={selectedInviteUserIds}
                onChange={(values) => setSelectedInviteUserIds(values.map(String))}
              >
                {userSearchResults.map((user) => (
                  <Checkbox key={user.id} value={user.id} className="knowledge-team-row">
                    <span className="knowledge-team-user">
                      <strong>{user.username}</strong>
                      <small>{user.email}</small>
                    </span>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('ui.searchAndSelectUsersToInvite')}
              />
            )}
          </Spin>
        </div>
      </Modal>

      <Modal
        closable={{ 'aria-label': t('ui.close') }}
        open={memberOpen}
        title={t('ui.teamMembers')}
        width={560}
        centered
        footer={null}
        onCancel={() => setMemberOpen(false)}
      >
        <Spin spinning={teamMembersLoading}>
          <div className="knowledge-team-dialog">
            {teamMembers.length ? (
              teamMembers.map((member) => (
                <div key={member.id} className="knowledge-team-row">
                  <span className="knowledge-team-user">
                    <strong>{member.username}</strong>
                    <small>{member.email}</small>
                  </span>
                  <Button danger type="link" onClick={() => void removeMember(member)}>
                    {t('ui.remove')}
                  </Button>
                </div>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noMembersYet')} />
            )}
          </div>
        </Spin>
      </Modal>
    </div>
  )
}
