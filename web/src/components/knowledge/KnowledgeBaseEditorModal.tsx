import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
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
  useTranslation()
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
      void message.warning(t('ui.onlyTxtOrDocxAttachmentsAreSupported'))
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
      closable={{ 'aria-label': t('ui.close') }}
      open={open}
      title={knowledgeBase ? t('ui.updateKnowledgeBase') : t('ui.newKnowledgeBase')}
      width={560}
      centered
      mask={{ closable: false }}
      confirmLoading={loading}
      okText={knowledgeBase ? t('ui.saveChanges') : t('ui.create')}
      cancelText={t('ui.cancel')}
      onOk={() => void submit()}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" className="knowledge-editor-form">
        <Form.Item
          name="title"
          label={t('ui.title')}
          rules={[{ required: true, whitespace: true, message: t('ui.enterAKnowledgeBaseTitle') }]}
        >
          <Input maxLength={120} placeholder={t('ui.enterAKnowledgeBaseTitle2')} />
        </Form.Item>
        <Form.Item name="visibility" label={t('ui.visibility')} initialValue="private">
          <Segmented
            block
            options={[
              { label: t('ui.private'), value: 'private' },
              { label: t('ui.team'), value: 'team' }
            ]}
          />
        </Form.Item>
        <Form.Item
          name="content"
          label={t('ui.description')}
          rules={[{ required: true, whitespace: true, message: t('ui.enterKnowledgeBaseContent') }]}
        >
          <Input.TextArea
            rows={6}
            maxLength={1000}
            showCount
            placeholder={t('ui.enterADescriptionOrKeyContentUpTo1000Characters')}
          />
        </Form.Item>

        <div className="knowledge-editor-file">
          {selectedFile ? (
            <div className="knowledge-editor-file-chip">
              <FileTextOutlined />
              <span>{selectedFile.name}</span>
              <Button danger type="link" onClick={() => setSelectedFile(null)}>
                {t('ui.remove')}
              </Button>
            </div>
          ) : knowledgeBase?.attachmentName ? (
            <div className="knowledge-editor-file-chip">
              <FileTextOutlined />
              <span>
                {t('ui.currentAttachment')}
                {knowledgeBase.attachmentName}
              </span>
              <Button type="link" onClick={() => fileInputRef.current?.click()}>
                {t('ui.replace')}
              </Button>
            </div>
          ) : (
            <Button
              className="knowledge-editor-upload"
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('ui.uploadAttachmentTxtDocxOptional')}
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
