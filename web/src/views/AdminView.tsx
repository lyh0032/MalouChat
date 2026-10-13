import { useTranslation } from 'react-i18next'
import { t } from '../i18n'
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
  const specializedOptions: Array<{
    type: SpecializedType
    icon: React.ReactNode
    title: string
    description: string
  }> = [
    {
      type: 'embedding',
      icon: <NodeIndexOutlined />,
      title: t('ui.embeddingModel'),
      description: t('ui.embeddingsAndSemanticSearchForFilesAndKnowledgeBases')
    },
    {
      type: 'vision',
      icon: <EyeOutlined />,
      title: t('ui.visionModel'),
      description: t('ui.imageUnderstandingSceneAnalysisAndOcr')
    },
    {
      type: 'speech',
      icon: <AudioOutlined />,
      title: t('ui.speechModel'),
      description: t('ui.transcribesRecordedAudio')
    },
    {
      type: 'image',
      icon: <PictureOutlined />,
      title: t('ui.imageGenerationModel'),
      description: t('ui.generatesImagesFromPrompts')
    }
  ]

  useTranslation()
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
      void message.success(t('ui.modelOrderSaved'))
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
      void message.success(
        input.type === 'chat'
          ? t('ui.chatModelSaved')
          : t('ui.specializedModelConfigurationUpdated')
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function setDefault(model: AiModelRecord) {
    if (model.isDefault) return
    await updateAdminModel(model.id, { ...modelToInput(model), isDefault: true })
    await Promise.all([loadModels(true), loadModelPreferences(true)])
    void message.success(t('ui.valueIsNowTheDefaultModel', { v0: model.displayName }))
  }

  function confirmApplyToAll(model: AiModelRecord) {
    modal.confirm({
      title: t('ui.resetTheModelForAllUsers'),
      content: t('ui.thisWillSwitchEveryUserSChatModelToValueContinue', { v0: model.displayName }),
      okText: t('ui.confirmReset'),
      cancelText: t('ui.cancel'),
      async onOk() {
        setApplyingModelId(model.id)
        try {
          const result = await applyChatModelToAllUsers(model.id)
          void message.success(
            t('ui.switchedValueUsersToValue', {
              v0: result.updatedUserCount,
              v1: result.displayName
            })
          )
        } finally {
          setApplyingModelId('')
        }
      }
    })
  }

  function confirmDelete(model: AiModelRecord) {
    if (model.isDefault) {
      void message.warning(t('ui.chooseAnotherDefaultModelBeforeDeletingThisOne'))
      return
    }
    modal.confirm({
      title: t('ui.deleteChatModel'),
      content: t('ui.deleteTheChatModelValue', { v0: model.displayName }),
      okText: t('ui.delete'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        await deleteAdminModel(model.id)
        await Promise.all([loadModels(true), loadModelPreferences(true)])
        void message.success(t('ui.chatModelDeleted'))
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
          <strong>{t('ui.chatModel')}</strong>
          <small>{t('ui.multipleChoicesOneDefault')}</small>
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
          <strong>{t('ui.specializedModels')}</strong>
          <small>{t('ui.separateConfigurationForEachCapability')}</small>
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
        summaryTitle={t('ui.modelManagement')}
        summaryText={t('ui.chatModelsAndSpecializedAiCapabilities')}
        icon={<ToolOutlined />}
        stats={sidebarNav}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="admin-main">
        <header className="admin-header management-page-header">
          <div className="admin-header-main management-page-header-main">
            {isMobile ? (
              <ManagementSidebarToggle
                label={t('ui.openSidebar')}
                onClick={() => setSidebarOpen(true)}
              />
            ) : null}
            <h2>{t('ui.modelManagement')}</h2>
          </div>
        </header>

        <Spin spinning={isLoading}>
          <div className="admin-content">
            <section id="chat-models" className="model-section">
              <div className="section-heading">
                <div>
                  <h2>{t('ui.chatModel')}</h2>
                  <p>{t('ui.configureMultipleModelsForUsersToChooseFromAndSetOne')}</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateChatModel}>
                  {t('ui.addChatModel')}
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
                          title={t('ui.reorder')}
                          aria-label={t('ui.dragToReorderModels')}
                        >
                          <MenuOutlined />
                        </button>
                        <div className="model-symbol">
                          {model.displayName.trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="chat-model-copy">
                          <div>
                            <h3>{model.displayName}</h3>
                            {model.isDefault ? (
                              <span className="default-badge">{t('ui.default')}</span>
                            ) : null}
                          </div>
                          <code>{model.code}</code>
                          {model.description ? <p>{model.description}</p> : null}
                        </div>
                      </div>
                      <div className="chat-model-actions">
                        {!model.isDefault ? (
                          <Button type="text" size="small" onClick={() => void setDefault(model)}>
                            {t('ui.setAsDefault')}
                          </Button>
                        ) : null}
                        <Button
                          icon={<ReloadOutlined />}
                          loading={applyingModelId === model.id}
                          onClick={() => confirmApplyToAll(model)}
                        >
                          {t('ui.resetForAllUsers')}
                        </Button>
                        <Tooltip title={t('ui.editModel')}>
                          <Button
                            shape="circle"
                            icon={<EditOutlined />}
                            aria-label={t('ui.editModel')}
                            onClick={() => openModel(model)}
                          />
                        </Tooltip>
                        <Tooltip
                          title={
                            model.isDefault
                              ? t('ui.theDefaultModelCannotBeDeleted')
                              : t('ui.deleteModel')
                          }
                        >
                          <Button
                            danger
                            shape="circle"
                            icon={<DeleteOutlined />}
                            aria-label={t('ui.deleteModel')}
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
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noChatModelsYet')}>
                    <Button type="primary" onClick={openCreateChatModel}>
                      {t('ui.addModel')}
                    </Button>
                  </Empty>
                </div>
              ) : null}
            </section>

            <section id="specialized-models" className="model-section">
              <div className="section-heading">
                <div>
                  <h2>{t('ui.specializedModels')}</h2>
                  <p>{t('ui.eachCapabilityUsesOneModelClickItsEditButtonToChange')}</p>
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
                          aria-label={t('ui.editValue', { v0: option.title })}
                          onClick={() => openSpecialized(option.type)}
                        />
                      </div>
                      <div className="specialized-model-value">
                        <span>{t('ui.currentModel')}</span>
                        <strong>{model?.displayName || t('ui.notConfigured')}</strong>
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
