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

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已完成', value: 'completed' },
  { label: '处理中', value: 'processing' },
  { label: '失败', value: 'failed' }
]

const statusLabels: Record<KnowledgeBaseStatus, string> = {
  queued: '排队中',
  processing: '处理中',
  completed: '已完成',
  failed: '处理失败'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatSize(bytes: number | null) {
  if (bytes == null) return '无附件'
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
      { label: '总数', count: knowledgeBases.length },
      { label: '可用', count: completed },
      { label: '处理中', count: processing },
      { label: '失败', count: failed }
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
      void message.info('访客账号暂不支持新建知识库，请注册或登录正式账号后使用')
      return
    }

    setEditorTarget('create')
  }

  async function submitKnowledgeBase(input: CreateKnowledgeBaseInput) {
    if (editingKnowledgeBase) {
      const record = await updateKnowledgeBase(editingKnowledgeBase.id, input)
      setEditorTarget(null)
      setDetailId(record.id)
      void message.success('知识库已更新，正在同步索引')
      return
    }

    const record = await createKnowledgeBase(input)
    setEditorTarget(null)
    setDetailId(record.id)
    void message.success('知识库已创建，正在后台处理')
  }

  function confirmDelete(record: KnowledgeBaseRecord) {
    modal.confirm({
      title: '删除知识库',
      content: '删除后知识库内容和附件都会被清理，确认删除吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        await deleteKnowledgeBase(record.id)
        if (detailId === record.id) setDetailId('')
        void message.success('知识库已删除')
      }
    })
  }

  function confirmVisibility(record: KnowledgeBaseRecord, visibility: KnowledgeBaseVisibility) {
    modal.confirm({
      title: visibility === 'team' ? '设为团队知识库' : '设为私有知识库',
      content:
        visibility === 'team'
          ? '设为团队后，你可以邀请其他用户共同引用该知识库。确认设置为团队知识库吗？'
          : '设为私有后，所有团队成员会被移除，他们会话中绑定的该知识库也会自动解除。确认设置为私有吗？',
      okText: visibility === 'team' ? '设为团队' : '设为私有',
      cancelText: '取消',
      async onOk() {
        const updated = await updateKnowledgeBaseVisibility(record.id, visibility)
        replaceKnowledgeBase(updated)
        if (visibility === 'private') markConversationBindingsDirty()
        void message.success(visibility === 'team' ? '已设为团队知识库' : '已设为私有知识库')
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
            ? `已发送 ${result.createdCount} 个邀请，跳过 ${skippedCount} 个重复用户`
            : '邀请已发送'
        )
      } else {
        void message.warning('所选用户已在团队中或已有待处理邀请')
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
    void message.success('成员已移除')
  }

  function confirmLeave(record: KnowledgeBaseRecord) {
    modal.confirm({
      title: '退出团队知识库',
      content: '退出后该知识库将不再出现在你的列表中，确认退出吗？',
      okText: '退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        await leaveKnowledgeBase(record.id)
        removeKnowledgeBaseLocally(record.id, true)
        void message.success('已退出团队知识库')
      }
    })
  }

  function menuItems(record: KnowledgeBaseRecord): MenuProps['items'] {
    if (record.role === 'member') return [{ key: 'leave', label: '退出', danger: true }]
    return [
      { key: 'edit', label: '更新' },
      {
        key: record.visibility === 'private' ? 'team' : 'private',
        label: record.visibility === 'private' ? '设为团队' : '设为私有'
      },
      ...(record.visibility === 'team'
        ? [
            { key: 'invite', label: '邀请用户' },
            { key: 'members', label: '管理成员' }
          ]
        : []),
      { type: 'divider' },
      { key: 'delete', label: '删除', danger: true }
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
        summaryTitle="知识库中心"
        summaryText={`${knowledgeBases.length} 个知识库`}
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
              <ManagementSidebarToggle label="打开侧边菜单" onClick={() => setSidebarOpen(true)} />
            ) : null}
            <h2>知识库管理</h2>
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
          <span>{filteredKnowledgeBases.length} 项</span>
        </section>

        <section className="knowledge-layout-content">
          <Spin spinning={isLoading}>
            {!isLoading && knowledgeBases.length === 0 ? (
              <div className="knowledge-layout-state">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有知识库">
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateEditor}
                  >
                    新建知识库
                  </Button>
                </Empty>
              </div>
            ) : !isLoading && filteredKnowledgeBases.length === 0 ? (
              <div className="knowledge-layout-state">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有结果">
                  <Button onClick={() => setStatusFilter('all')}>查看全部</Button>
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
                          {record.visibility === 'team' ? '团队' : '私有'}
                        </span>
                        <span
                          className={`knowledge-card-badge knowledge-card-badge--${record.role}`}
                        >
                          {record.role === 'owner' ? '创建者' : '成员'}
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
                        <FileTextOutlined /> {record.attachmentName || '仅文本内容'}
                      </span>
                      <small>{formatSize(record.attachmentSize)}</small>
                    </div>
                    {record.processingStatus === 'failed' && record.processingError ? (
                      <div className="knowledge-card-error">{record.processingError}</div>
                    ) : null}
                    <footer className="knowledge-card-footer">
                      <time dateTime={record.updatedAt}>更新于 {formatDate(record.updatedAt)}</time>
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
                          aria-label="知识库操作"
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
        open={inviteOpen}
        title="邀请团队成员"
        width={560}
        centered
        okText="发送邀请"
        cancelText="取消"
        confirmLoading={inviteSubmitting}
        okButtonProps={{ disabled: selectedInviteUserIds.length === 0 }}
        onOk={() => void sendInvitations()}
        onCancel={() => setInviteOpen(false)}
      >
        <div className="knowledge-team-dialog">
          <Input.Search
            value={userSearchKeyword}
            loading={userSearchLoading}
            placeholder="搜索用户名或邮箱"
            allowClear
            enterButton="搜索"
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="搜索后选择要邀请的用户" />
            )}
          </Spin>
        </div>
      </Modal>

      <Modal
        open={memberOpen}
        title="团队成员"
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
                    移除
                  </Button>
                </div>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有成员" />
            )}
          </div>
        </Spin>
      </Modal>
    </div>
  )
}
