import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Segmented } from 'antd'
import { FileTextOutlined, UploadOutlined } from '@ant-design/icons'

import type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseRecord,
  KnowledgeBaseVisibility
} from '../../types/knowledge-base'

import './KnowledgeBaseModals.css'

type EditorForm = {
  title: string
  content: string
  visibility: KnowledgeBaseVisibility
}

type Props = {
  open: boolean
  loading: boolean
  knowledgeBase: KnowledgeBaseRecord | null
  onClose: () => void
  onSubmit: (input: CreateKnowledgeBaseInput) => Promise<void>
}

export default function KnowledgeBaseEditorModal({
  open,
  loading,
  knowledgeBase,
  onClose,
  onSubmit
}: Props) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<EditorForm>()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      title: knowledgeBase?.title ?? '',
      content: knowledgeBase?.content ?? '',
      visibility: knowledgeBase?.visibility ?? 'private'
    })
    setSelectedFile(null)
  }, [form, knowledgeBase, open])

  function selectFile(file: File | undefined) {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const isTxt = file.type.startsWith('text/') || lowerName.endsWith('.txt')
    const isDocx =
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    if (!isTxt && !isDocx) {
      void message.warning('附件仅支持 txt 或 docx 文件')
      return
    }
    setSelectedFile(file)
  }

  async function submit() {
    const values = await form.validateFields()
    await onSubmit({
      title: values.title.trim(),
      content: values.content.trim(),
      visibility: values.visibility,
      file: selectedFile
    })
  }

  return (
    <Modal
      open={open}
      title={knowledgeBase ? '更新知识库' : '新建知识库'}
      width={560}
      centered
      mask={{ closable: false }}
      confirmLoading={loading}
      okText={knowledgeBase ? '保存更新' : '创建'}
      cancelText="取消"
      onOk={() => void submit()}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" className="knowledge-editor-form">
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, whitespace: true, message: '请输入知识库标题' }]}
        >
          <Input maxLength={120} placeholder="输入知识库标题" />
        </Form.Item>
        <Form.Item name="visibility" label="可见范围" initialValue="private">
          <Segmented
            block
            options={[
              { label: '私有', value: 'private' },
              { label: '团队', value: 'team' }
            ]}
          />
        </Form.Item>
        <Form.Item
          name="content"
          label="内容介绍"
          rules={[{ required: true, whitespace: true, message: '请输入知识库内容' }]}
        >
          <Input.TextArea
            rows={6}
            maxLength={1000}
            showCount
            placeholder="输入知识库介绍或核心内容，最多 1000 字"
          />
        </Form.Item>

        <div className="knowledge-editor-file">
          {selectedFile ? (
            <div className="knowledge-editor-file-chip">
              <FileTextOutlined />
              <span>{selectedFile.name}</span>
              <Button danger type="link" onClick={() => setSelectedFile(null)}>
                移除
              </Button>
            </div>
          ) : knowledgeBase?.attachmentName ? (
            <div className="knowledge-editor-file-chip">
              <FileTextOutlined />
              <span>当前附件：{knowledgeBase.attachmentName}</span>
              <Button type="link" onClick={() => fileInputRef.current?.click()}>
                替换
              </Button>
            </div>
          ) : (
            <Button
              className="knowledge-editor-upload"
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              上传附件（txt / docx，可选）
            </Button>
          )}
          <input
            ref={fileInputRef}
            className="knowledge-editor-file-input"
            hidden
            type="file"
            accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              selectFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
      </Form>
    </Modal>
  )
}
