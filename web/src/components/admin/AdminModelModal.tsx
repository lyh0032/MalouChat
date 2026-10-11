import { useEffect } from 'react'
import { Form, Input, InputNumber, Modal, Switch } from 'antd'

import type { AiModelInput, AiModelRecord, AiModelType } from '../../types/admin-model'

import './AdminModelModal.css'

type Props = {
  open: boolean
  loading: boolean
  type: AiModelType
  model: AiModelRecord | null
  chatModelCount: number
  onClose: () => void
  onSubmit: (input: AiModelInput) => Promise<void>
}

function initialInput(
  type: AiModelType,
  model: AiModelRecord | null,
  chatModelCount: number
): AiModelInput {
  if (model) {
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
  return {
    code: '',
    displayName: '',
    description: '',
    provider: 'dashscope',
    type,
    isEnabled: true,
    isUserSelectable: type === 'chat',
    isDefault: type === 'chat' ? chatModelCount === 0 : true,
    sortOrder: 10,
    dimensions: type === 'embedding' ? 1024 : null,
    settings: type === 'image' ? { size: '1024*1024', promptExtend: true, watermark: false } : null
  }
}

const typeLabels: Record<AiModelType, string> = {
  chat: '对话模型',
  embedding: '向量模型',
  vision: '多模态模型',
  speech: '语音模型',
  image: '文生图模型'
}

export default function AdminModelModal({
  open,
  loading,
  type,
  model,
  chatModelCount,
  onClose,
  onSubmit
}: Props) {
  const [form] = Form.useForm<AiModelInput>()

  useEffect(() => {
    if (open) form.setFieldsValue(initialInput(type, model, chatModelCount))
  }, [chatModelCount, form, model, open, type])

  async function submit() {
    const values = await form.validateFields()
    const isChat = type === 'chat'
    await onSubmit({
      ...values,
      code: values.code.trim(),
      displayName: values.displayName.trim(),
      description: values.description?.trim() ?? '',
      provider: 'dashscope',
      type,
      isEnabled: true,
      isUserSelectable: isChat,
      isDefault: isChat ? values.isDefault : true,
      dimensions: type === 'embedding' ? 1024 : null,
      settings:
        type === 'image'
          ? (values.settings ?? { size: '1024*1024', promptExtend: true, watermark: false })
          : null
    })
  }

  return (
    <Modal
      open={open}
      title={
        type === 'chat' ? (model ? '编辑对话模型' : '添加对话模型') : `配置${typeLabels[type]}`
      }
      width={620}
      centered
      mask={{ closable: false }}
      okText="保存配置"
      cancelText="取消"
      confirmLoading={loading}
      onOk={() => void submit()}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" className="admin-model-form">
        <div className="admin-model-form-grid">
          <Form.Item
            name="displayName"
            label="显示名称"
            rules={[{ required: true, whitespace: true, message: '请输入显示名称' }]}
          >
            <Input maxLength={80} placeholder="例如 Qwen 3.7 Plus" />
          </Form.Item>
          <Form.Item
            name="code"
            label="模型标识"
            rules={[{ required: true, whitespace: true, message: '请输入模型标识' }]}
          >
            <Input maxLength={120} placeholder="例如 qwen3.7-plus" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="模型说明">
          <Input.TextArea
            rows={3}
            maxLength={300}
            showCount
            placeholder="简要说明模型的用途或特性"
          />
        </Form.Item>

        {type === 'chat' ? (
          <div className="admin-model-form-grid">
            <Form.Item name="sortOrder" label="显示顺序">
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <div className="admin-model-switch-row">
              <span>
                <strong>默认模型</strong>
                <small>
                  {model?.isDefault ? '当前模型已经是默认模型' : '新用户或无有效偏好时使用'}
                </small>
              </span>
              <Form.Item name="isDefault" valuePropName="checked" noStyle>
                <Switch disabled={Boolean(model?.isDefault)} />
              </Form.Item>
            </div>
          </div>
        ) : null}

        {type === 'embedding' ? (
          <Form.Item
            name="dimensions"
            label="向量维度"
            extra="当前 pgvector 数据结构固定为 1024 维。"
          >
            <InputNumber min={1024} max={1024} disabled />
          </Form.Item>
        ) : null}

        {type === 'image' ? (
          <div className="admin-image-settings">
            <div>
              <strong>生成参数</strong>
              <p>参数会和模型标识一起保存到数据库。</p>
            </div>
            <Form.Item
              name={['settings', 'size']}
              label="默认图片尺寸"
              rules={[
                { required: true },
                { pattern: /^\d+\*\d+$/, message: '请按 1024*1024 格式填写' }
              ]}
            >
              <Input placeholder="1024*1024" />
            </Form.Item>
            <label>
              <span>提示词智能扩展</span>
              <Form.Item name={['settings', 'promptExtend']} valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </label>
            <label>
              <span>生成图片水印</span>
              <Form.Item name={['settings', 'watermark']} valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </label>
          </div>
        ) : null}
      </Form>
    </Modal>
  )
}
