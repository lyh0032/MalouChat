import { useTranslation } from 'react-i18next'
import { t, getUiLanguage } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Button, Empty, Form, Input, Modal, Select, Spin } from 'antd'
import { DeleteOutlined, EditOutlined, ReadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import ManagementSidebar from '../components/management/ManagementSidebar'
import ManagementSidebarToggle from '../components/management/ManagementSidebarToggle'
import { useMobile } from '../hooks/useMobile'
import { getLastChatRoute } from '../router/chat-route-cache'
import { useMemoryStore } from '../stores/memory'
import type { MemoryRecord, MemoryType, UpdateMemoryInput } from '../types/memory'

import './MemoryView.css'
import '../components/management/ManagementPageLayout.css'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getUiLanguage(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default function MemoryView() {
  const memoryTypeLabelMap: Record<MemoryType, string> = {
    profile: t('ui.profile'),
    preference: t('ui.preference'),
    summary: t('ui.summary'),
    fact: t('ui.fact')
  }

  const memoryTypeOptions = (Object.keys(memoryTypeLabelMap) as MemoryType[]).map((value) => ({
    value,
    label: memoryTypeLabelMap[value]
  }))

  const { i18n: uiI18n } = useTranslation()
  const navigate = useNavigate()
  const { modal, message } = AntApp.useApp()
  const isMobile = useMobile()
  const memories = useMemoryStore((state) => state.memories)
  const isLoading = useMemoryStore((state) => state.isLoading)
  const loadMemories = useMemoryStore((state) => state.loadMemories)
  const updateMemory = useMemoryStore((state) => state.updateMemory)
  const deleteMemory = useMemoryStore((state) => state.deleteMemory)
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [editingMemory, setEditingMemory] = useState<MemoryRecord | null>(null)
  const [isUpdatingMemory, setUpdatingMemory] = useState(false)
  const [form] = Form.useForm<Required<UpdateMemoryInput>>()
  useEffect(() => {
    const fields = form
      .getFieldsError()
      .filter((field) => field.errors.length)
      .map((field) => field.name)
    if (fields.length) void form.validateFields(fields).catch(() => undefined)
  }, [form, uiI18n.language])
  const formValues = Form.useWatch([], form)

  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    void loadMemories({}, true)
  }, [loadMemories])

  const memoryStats = useMemo(() => {
    const counts: Record<MemoryType, number> = {
      profile: 0,
      preference: 0,
      summary: 0,
      fact: 0
    }

    memories.forEach((memory) => {
      counts[memory.type] += 1
    })

    return (Object.keys(memoryTypeLabelMap) as MemoryType[]).map((type) => ({
      type,
      label: memoryTypeLabelMap[type],
      count: counts[type]
    }))
  }, [memories, uiI18n.language])

  const formChanged = Boolean(
    editingMemory &&
    formValues &&
    (formValues.type !== editingMemory.type ||
      formValues.key?.trim() !== editingMemory.key ||
      formValues.content?.trim() !== editingMemory.content)
  )

  function returnToChat() {
    navigate(getLastChatRoute())
  }

  function openEditDialog(memory: MemoryRecord) {
    setEditingMemory(memory)
    form.setFieldsValue({
      type: memory.type,
      key: memory.key,
      content: memory.content
    })
  }

  function closeEditDialog() {
    if (isUpdatingMemory) return
    setEditingMemory(null)
    form.resetFields()
  }

  async function submitEdit() {
    if (!editingMemory || isUpdatingMemory || !formChanged) return

    const values = await form.validateFields()
    setUpdatingMemory(true)

    try {
      await updateMemory(editingMemory.id, {
        type: values.type,
        key: values.key.trim(),
        content: values.content.trim()
      })
      setEditingMemory(null)
      form.resetFields()
      void message.success(t('ui.memoryUpdated'))
    } finally {
      setUpdatingMemory(false)
    }
  }

  function confirmDelete(memoryId: string) {
    modal.confirm({
      title: t('ui.deleteMemory'),
      content: t('ui.deleteThisLongTermMemoryThisCannotBeUndone'),
      okText: t('ui.delete'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        await deleteMemory(memoryId)
        void message.success(t('ui.memoryDeleted'))
      }
    })
  }

  const sidebarStats = (
    <>
      <article className="management-sidebar-stat">
        <span>{t('ui.totalMemories')}</span>
        <strong>{memories.length}</strong>
      </article>
      {memoryStats.map((item) => (
        <article key={item.type} className="management-sidebar-stat">
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </article>
      ))}
    </>
  )

  return (
    <div className="memory-layout">
      <ManagementSidebar
        isMobile={isMobile}
        isOpen={isSidebarOpen}
        activeItem="memories"
        summaryTitle={t('ui.longTermMemories')}
        summaryText={t('counts.memories', { count: memories.length })}
        icon={<ReadOutlined />}
        stats={sidebarStats}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="memory-layout-main">
        <header className="memory-layout-header management-page-header">
          <div className="memory-layout-header-main management-page-header-main">
            {isMobile ? (
              <ManagementSidebarToggle
                label={t('ui.openSidebar')}
                onClick={() => setSidebarOpen(true)}
              />
            ) : null}
            <h2>{t('ui.memoryManagement')}</h2>
          </div>
        </header>

        <section className="memory-layout-content">
          <Spin spinning={isLoading}>
            {!isLoading && memories.length === 0 ? (
              <div className="memory-layout-state">
                <Empty
                  description={t('ui.noLongTermMemoriesYet')}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <p>
                    {t(
                      'ui.stableMeaningfulInformationSharedInConversationsIsAutomaticallyExtractedAndSaved'
                    )}
                  </p>
                </Empty>
              </div>
            ) : (
              <div className="memory-layout-grid">
                {memories.map((memory) => (
                  <article key={memory.id} className="memory-card">
                    <span className="memory-card-badge">{memoryTypeLabelMap[memory.type]}</span>
                    <h3 className="memory-card-key">{memory.key}</h3>
                    <p className="memory-card-content">{memory.content}</p>
                    <div className="memory-card-aside">
                      <div className="memory-card-actions">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => openEditDialog(memory)}
                        >
                          {t('ui.edit')}
                        </Button>
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => confirmDelete(memory.id)}
                        >
                          {t('ui.delete')}
                        </Button>
                      </div>
                      <div className="memory-card-footer">
                        <span>{t('ui.updated')}</span>
                        <time dateTime={memory.updatedAt}>{formatDate(memory.updatedAt)}</time>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Spin>
        </section>
      </main>

      <Modal
        open={Boolean(editingMemory)}
        title={t('ui.editMemory')}
        width={560}
        centered
        mask={{ closable: false }}
        keyboard={!isUpdatingMemory}
        closable={isUpdatingMemory ? false : { 'aria-label': t('ui.close') }}
        confirmLoading={isUpdatingMemory}
        okText={t('ui.save')}
        cancelText={t('ui.cancel')}
        okButtonProps={{ disabled: !formChanged }}
        onOk={() => void submitEdit()}
        onCancel={closeEditDialog}
        afterClose={() => form.resetFields()}
      >
        <Form form={form} layout="vertical" className="memory-edit-form">
          <Form.Item
            label={t('ui.memoryType')}
            name="type"
            rules={[{ required: true, message: t('ui.selectAMemoryType') }]}
          >
            <Select options={memoryTypeOptions} placeholder={t('ui.selectAMemoryType')} />
          </Form.Item>
          <Form.Item
            label={t('ui.memoryKey')}
            name="key"
            rules={[
              { required: true, whitespace: true, message: t('ui.enterAMemoryKey') },
              { max: 80, message: t('ui.memoryKeysMustBe80CharactersOrFewer') }
            ]}
          >
            <Input maxLength={80} showCount placeholder={t('ui.eGPreferredLanguage')} />
          </Form.Item>
          <Form.Item
            label={t('ui.memoryContent')}
            name="content"
            rules={[
              { required: true, whitespace: true, message: t('ui.enterMemoryContent') },
              { max: 2000, message: t('ui.memoryContentMustBe2000CharactersOrFewer') }
            ]}
          >
            <Input.TextArea
              maxLength={2000}
              showCount
              rows={7}
              placeholder={t('ui.enterInformationToRememberLongTerm')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
