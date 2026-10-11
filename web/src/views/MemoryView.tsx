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

const memoryTypeLabelMap: Record<MemoryType, string> = {
  profile: '个人信息',
  preference: '偏好',
  summary: '总结',
  fact: '事实'
}

const memoryTypeOptions = (Object.keys(memoryTypeLabelMap) as MemoryType[]).map((value) => ({
  value,
  label: memoryTypeLabelMap[value]
}))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default function MemoryView() {
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
  }, [memories])

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
      void message.success('记忆已更新')
    } finally {
      setUpdatingMemory(false)
    }
  }

  function confirmDelete(memoryId: string) {
    modal.confirm({
      title: '删除记忆',
      content: '删除后不可恢复，确认删除这条长期记忆吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        await deleteMemory(memoryId)
        void message.success('记忆已删除')
      }
    })
  }

  const sidebarStats = (
    <>
      <article className="management-sidebar-stat">
        <span>总记忆数</span>
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
        summaryTitle="长期记忆"
        summaryText={`${memories.length} 条记忆`}
        icon={<ReadOutlined />}
        stats={sidebarStats}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="memory-layout-main">
        <header className="memory-layout-header management-page-header">
          <div className="memory-layout-header-main management-page-header-main">
            {isMobile ? (
              <ManagementSidebarToggle label="打开侧边菜单" onClick={() => setSidebarOpen(true)} />
            ) : null}
            <h2>记忆管理</h2>
          </div>
        </header>

        <section className="memory-layout-content">
          <Spin spinning={isLoading}>
            {!isLoading && memories.length === 0 ? (
              <div className="memory-layout-state">
                <Empty description="还没有长期记忆" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <p>当用户在对话中表达稳定且重要的信息时，系统会自动提取并保存在这里。</p>
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
                          编辑
                        </Button>
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => confirmDelete(memory.id)}
                        >
                          删除
                        </Button>
                      </div>
                      <div className="memory-card-footer">
                        <span>更新于</span>
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
        title="编辑记忆"
        width={560}
        centered
        mask={{ closable: false }}
        keyboard={!isUpdatingMemory}
        closable={!isUpdatingMemory}
        confirmLoading={isUpdatingMemory}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !formChanged }}
        onOk={() => void submitEdit()}
        onCancel={closeEditDialog}
        afterClose={() => form.resetFields()}
      >
        <Form form={form} layout="vertical" className="memory-edit-form">
          <Form.Item
            label="记忆类型"
            name="type"
            rules={[{ required: true, message: '请选择记忆类型' }]}
          >
            <Select options={memoryTypeOptions} placeholder="请选择记忆类型" />
          </Form.Item>
          <Form.Item
            label="记忆标识"
            name="key"
            rules={[
              { required: true, whitespace: true, message: '请输入记忆标识' },
              { max: 80, message: '记忆标识不能超过 80 个字符' }
            ]}
          >
            <Input maxLength={80} showCount placeholder="例如 preferred_language" />
          </Form.Item>
          <Form.Item
            label="记忆内容"
            name="content"
            rules={[
              { required: true, whitespace: true, message: '请输入记忆内容' },
              { max: 2000, message: '记忆内容不能超过 2000 个字符' }
            ]}
          >
            <Input.TextArea
              maxLength={2000}
              showCount
              rows={7}
              placeholder="请输入需要长期保留的记忆内容"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
