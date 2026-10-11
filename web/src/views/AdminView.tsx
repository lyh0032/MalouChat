import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button, Empty, Spin, Tooltip } from 'antd'
import {
  AudioOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MenuOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined
} from '@ant-design/icons'
import Sortable from 'sortablejs'
import { useNavigate } from 'react-router-dom'

import {
  applyChatModelToAllUsers,
  createAdminModel,
  deleteAdminModel,
  reorderAdminChatModels,
  updateAdminModel
} from '../api/admin-model'
import AdminModelModal from '../components/admin/AdminModelModal'
import ManagementSidebar from '../components/management/ManagementSidebar'
import ManagementSidebarToggle from '../components/management/ManagementSidebarToggle'
import { useMobile } from '../hooks/useMobile'
import { getLastChatRoute } from '../router/chat-route-cache'
import { useAdminModelStore } from '../stores/admin-model'
import { usePreferencesStore } from '../stores/preferences'
import type { AiModelInput, AiModelRecord, AiModelType } from '../types/admin-model'
import { isCoarsePointerDevice } from '../utils/pointer-device'

import './AdminView.css'
import '../components/management/ManagementPageLayout.css'

type SortableOptionsWithPointerSupport = Sortable.Options & { supportPointer?: boolean }
type SpecializedType = Exclude<AiModelType, 'chat'>

const specializedOptions: Array<{
  type: SpecializedType
  icon: React.ReactNode
  title: string
  description: string
}> = [
  {
    type: 'embedding',
    icon: <NodeIndexOutlined />,
    title: '向量模型',
    description: '负责文件、知识库的向量化和语义检索'
  },
  {
    type: 'vision',
    icon: <EyeOutlined />,
    title: '多模态模型',
    description: '负责图片理解、场景分析和 OCR'
  },
  {
    type: 'speech',
    icon: <AudioOutlined />,
    title: '语音模型',
    description: '负责录音内容的语音转文字'
  },
  {
    type: 'image',
    icon: <PictureOutlined />,
    title: '文生图模型',
    description: '负责根据提示词生成图片'
  }
]

function modelToInput(model: AiModelRecord): AiModelInput {
  return {
    code: model.code,
    displayName: model.displayName,
    description: model.description,
    provider: 'dashscope',
    type: model.type,
    isEnabled: true,
    isUserSelectable: model.type === 'chat',
    isDefault: model.isDefault,
    sortOrder: model.sortOrder,
    dimensions: model.type === 'embedding' ? 1024 : null,
    settings: model.settings ? { ...model.settings } : null
  }
}

export default function AdminView() {
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const isMobile = useMobile()
  const models = useAdminModelStore((state) => state.models)
  const isLoading = useAdminModelStore((state) => state.isLoading)
  const loadModels = useAdminModelStore((state) => state.loadModels)
  const setModels = useAdminModelStore((state) => state.setModels)
  const loadModelPreferences = usePreferencesStore((state) => state.loadModelPreferences)
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [dialogType, setDialogType] = useState<AiModelType | null>(null)
  const [editingModel, setEditingModel] = useState<AiModelRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [applyingModelId, setApplyingModelId] = useState('')
  const [sortingChatModels, setSortingChatModels] = useState(false)
  const chatModelListRef = useRef<HTMLDivElement>(null)
  const chatModelsRef = useRef<AiModelRecord[]>([])

  const chatModels = useMemo(
    () =>
      models
        .filter((model) => model.type === 'chat')
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [models]
  )
  chatModelsRef.current = chatModels

  const specializedModels = useMemo(
    () =>
      Object.fromEntries(
        specializedOptions.map((option) => [
          option.type,
          models.find((model) => model.type === option.type && model.isDefault) ??
            models.find((model) => model.type === option.type) ??
            null
        ])
      ) as Record<SpecializedType, AiModelRecord | null>,
    [models]
  )

  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    void loadModels(true)
  }, [loadModels])

  useEffect(() => {
    const element = chatModelListRef.current
    if (!element || chatModels.length < 2) return

    const usesTouchFallback = isCoarsePointerDevice()
    const options: SortableOptionsWithPointerSupport = {
      animation: 160,
      handle: '.chat-model-drag-handle',
      draggable: '.chat-model-card',
      ghostClass: 'chat-model-ghost',
      chosenClass: 'chat-model-chosen',
      dragClass: 'chat-model-dragging',
      fallbackClass: 'chat-model-fallback',
      forceFallback: usesTouchFallback,
      fallbackOnBody: usesTouchFallback,
      supportPointer: !usesTouchFallback,
      delay: usesTouchFallback ? 160 : 0,
      delayOnTouchOnly: false,
      touchStartThreshold: 5,
      fallbackTolerance: 4,
      onEnd(event) {
        if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex)
          return
        void saveOrder(event.oldIndex, event.newIndex)
      }
    }

    const sortable = Sortable.create(element, options)
    return () => sortable.destroy()
  }, [chatModels.length])

  async function saveOrder(oldIndex: number, newIndex: number) {
    const orderedModels = [...chatModelsRef.current]
    const [moved] = orderedModels.splice(oldIndex, 1)
    if (!moved) {
      await loadModels(true)
      return
    }
    orderedModels.splice(newIndex, 0, moved)
    const orderById = new Map(orderedModels.map((model, index) => [model.id, (index + 1) * 10]))
    const currentModels = useAdminModelStore.getState().models
    setModels(
      currentModels.map((model) => ({
        ...model,
        sortOrder: orderById.get(model.id) ?? model.sortOrder
      }))
    )
    setSortingChatModels(true)
    try {
      const saved = await reorderAdminChatModels(orderedModels.map((model) => model.id))
      const latestModels = useAdminModelStore.getState().models
      setModels([...latestModels.filter((model) => model.type !== 'chat'), ...saved])
      await loadModelPreferences(true)
      void message.success('模型顺序已保存')
    } catch (error) {
      await loadModels(true)
      throw error
    } finally {
      setSortingChatModels(false)
    }
  }

  function openCreateChatModel() {
    setEditingModel(null)
    setDialogType('chat')
  }

  function openModel(model: AiModelRecord) {
    setEditingModel(model)
    setDialogType(model.type)
  }

  function openSpecialized(type: SpecializedType) {
    setEditingModel(specializedModels[type])
    setDialogType(type)
  }

  async function submitModel(input: AiModelInput) {
    setSubmitting(true)
    try {
      if (editingModel) await updateAdminModel(editingModel.id, input)
      else await createAdminModel(input)
      setDialogType(null)
      await Promise.all([loadModels(true), loadModelPreferences(true)])
      void message.success(input.type === 'chat' ? '对话模型已保存' : '专用模型配置已更新')
    } finally {
      setSubmitting(false)
    }
  }

  async function setDefault(model: AiModelRecord) {
    if (model.isDefault) return
    await updateAdminModel(model.id, { ...modelToInput(model), isDefault: true })
    await Promise.all([loadModels(true), loadModelPreferences(true)])
    void message.success(`「${model.displayName}」已设为默认模型`)
  }

  function confirmApplyToAll(model: AiModelRecord) {
    modal.confirm({
      title: '刷新全部用户模型',
      content: `这会把所有用户当前选择的对话模型统一切换为「${model.displayName}」。确认继续吗？`,
      okText: '确认刷新',
      cancelText: '取消',
      async onOk() {
        setApplyingModelId(model.id)
        try {
          const result = await applyChatModelToAllUsers(model.id)
          void message.success(`已将 ${result.updatedUserCount} 位用户切换到 ${result.displayName}`)
        } finally {
          setApplyingModelId('')
        }
      }
    })
  }

  function confirmDelete(model: AiModelRecord) {
    if (model.isDefault) {
      void message.warning('默认模型不能删除，请先设置另一个默认模型')
      return
    }
    modal.confirm({
      title: '删除对话模型',
      content: `确认删除对话模型「${model.displayName}」吗？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        await deleteAdminModel(model.id)
        await Promise.all([loadModels(true), loadModelPreferences(true)])
        void message.success('对话模型已删除')
      }
    })
  }

  function returnToChat() {
    navigate(getLastChatRoute())
  }

  const sidebarNav = (
    <>
      <a
        className="management-sidebar-nav-item"
        href="#chat-models"
        onClick={() => {
          if (isMobile) setSidebarOpen(false)
        }}
      >
        <span className="admin-nav-number">01</span>
        <span>
          <strong>对话模型</strong>
          <small>多个可选，一个默认</small>
        </span>
      </a>
      <a
        className="management-sidebar-nav-item"
        href="#specialized-models"
        onClick={() => {
          if (isMobile) setSidebarOpen(false)
        }}
      >
        <span className="admin-nav-number">02</span>
        <span>
          <strong>专用模型</strong>
          <small>每项能力单独配置</small>
        </span>
      </a>
    </>
  )

  return (
    <div className="admin-page">
      <ManagementSidebar
        isMobile={isMobile}
        isOpen={isSidebarOpen}
        activeItem="admin"
        summaryTitle="模型管理"
        summaryText="聊天模型与专用 AI 能力"
        icon={<ToolOutlined />}
        stats={sidebarNav}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="admin-main">
        <header className="admin-header management-page-header">
          <div className="admin-header-main management-page-header-main">
            {isMobile ? (
              <ManagementSidebarToggle label="打开侧边菜单" onClick={() => setSidebarOpen(true)} />
            ) : null}
            <h2>模型管理</h2>
          </div>
        </header>

        <Spin spinning={isLoading}>
          <div className="admin-content">
            <section id="chat-models" className="model-section">
              <div className="section-heading">
                <div>
                  <h2>对话模型</h2>
                  <p>
                    可以配置多个供用户选择的模型，其中一个作为默认模型。拖动排序图标即可调整用户看到的顺序。
                  </p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateChatModel}>
                  添加对话模型
                </Button>
              </div>

              {chatModels.length ? (
                <div ref={chatModelListRef} className="chat-model-grid">
                  {chatModels.map((model) => (
                    <article
                      key={model.id}
                      className={`chat-model-card${model.isDefault ? ' is-default' : ''}`}
                    >
                      <div className="chat-model-main">
                        <button
                          className="chat-model-drag-handle"
                          type="button"
                          disabled={sortingChatModels}
                          title="拖动排序"
                          aria-label="拖动调整模型顺序"
                        >
                          <MenuOutlined />
                        </button>
                        <div className="model-symbol">
                          {model.displayName.trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="chat-model-copy">
                          <div>
                            <h3>{model.displayName}</h3>
                            {model.isDefault ? <span className="default-badge">默认</span> : null}
                          </div>
                          <code>{model.code}</code>
                          {model.description ? <p>{model.description}</p> : null}
                        </div>
                      </div>
                      <div className="chat-model-actions">
                        {!model.isDefault ? (
                          <Button type="text" size="small" onClick={() => void setDefault(model)}>
                            设为默认
                          </Button>
                        ) : null}
                        <Button
                          icon={<ReloadOutlined />}
                          loading={applyingModelId === model.id}
                          onClick={() => confirmApplyToAll(model)}
                        >
                          刷新全部用户
                        </Button>
                        <Tooltip title="编辑模型">
                          <Button
                            shape="circle"
                            icon={<EditOutlined />}
                            aria-label="编辑模型"
                            onClick={() => openModel(model)}
                          />
                        </Tooltip>
                        <Tooltip title={model.isDefault ? '默认模型不能删除' : '删除模型'}>
                          <Button
                            danger
                            shape="circle"
                            icon={<DeleteOutlined />}
                            aria-label="删除模型"
                            disabled={model.isDefault}
                            onClick={() => confirmDelete(model)}
                          />
                        </Tooltip>
                      </div>
                    </article>
                  ))}
                </div>
              ) : !isLoading ? (
                <div className="admin-section-empty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对话模型">
                    <Button type="primary" onClick={openCreateChatModel}>
                      添加模型
                    </Button>
                  </Empty>
                </div>
              ) : null}
            </section>

            <section id="specialized-models" className="model-section">
              <div className="section-heading">
                <div>
                  <h2>专用模型</h2>
                  <p>每项能力只使用一个模型，点击对应编辑按钮即可修改当前配置。</p>
                </div>
              </div>
              <div className="specialized-grid">
                {specializedOptions.map((option) => {
                  const model = specializedModels[option.type]
                  return (
                    <article key={option.type} className={`specialized-card type-${option.type}`}>
                      <div className="specialized-card-head">
                        <div className="specialized-type">
                          <span className="specialized-icon">{option.icon}</span>
                          <span>
                            <strong>{option.title}</strong>
                            <small>{option.description}</small>
                          </span>
                        </div>
                        <Button
                          shape="circle"
                          icon={<EditOutlined />}
                          aria-label={`编辑${option.title}`}
                          onClick={() => openSpecialized(option.type)}
                        />
                      </div>
                      <div className="specialized-model-value">
                        <span>当前模型</span>
                        <strong>{model?.displayName || '暂未配置'}</strong>
                        {model ? <code>{model.code}</code> : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>
        </Spin>
      </main>

      <AdminModelModal
        open={Boolean(dialogType)}
        loading={submitting}
        type={dialogType ?? 'chat'}
        model={editingModel}
        chatModelCount={chatModels.length}
        onClose={() => setDialogType(null)}
        onSubmit={submitModel}
      />
    </div>
  )
}
