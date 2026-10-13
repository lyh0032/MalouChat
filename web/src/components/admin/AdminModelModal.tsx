import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
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

export default function AdminModelModal({
  open,
  loading,
  type,
  model,
  chatModelCount,
  onClose,
  onSubmit
}: Props) {
  const typeLabels: Record<AiModelType, string> = {
    chat: t('ui.chatModel'),
    embedding: t('ui.embeddingModel'),
    vision: t('ui.visionModel'),
    speech: t('ui.speechModel'),
    image: t('ui.imageGenerationModel')
  }

  useTranslation()
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
      closable={{ 'aria-label': t('ui.close') }}
      open={open}
      title={
        type === 'chat'
          ? model
            ? t('ui.editChatModel')
            : t('ui.addChatModel')
          : t('ui.configureValue', { v0: typeLabels[type] })
      }
      width={620}
      centered
      mask={{ closable: false }}
      okText={t('ui.saveConfiguration')}
      cancelText={t('ui.cancel')}
      confirmLoading={loading}
      onOk={() => void submit()}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" className="admin-model-form">
        <div className="admin-model-form-grid">
          <Form.Item
            name="displayName"
            label={t('ui.displayName')}
            rules={[{ required: true, whitespace: true, message: t('ui.enterADisplayName') }]}
          >
            <Input maxLength={80} placeholder={t('ui.eGQwen37Plus')} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t('ui.modelIdentifier')}
            rules={[{ required: true, whitespace: true, message: t('ui.enterAModelIdentifier') }]}
          >
            <Input maxLength={120} placeholder={t('ui.eGQwen37Plus2')} />
          </Form.Item>
        </div>
        <Form.Item name="description" label={t('ui.modelDescription')}>
          <Input.TextArea
            rows={3}
            maxLength={300}
            showCount
            placeholder={t('ui.brieflyDescribeTheModelSPurposeOrFeatures')}
          />
        </Form.Item>

        {type === 'chat' ? (
          <div className="admin-model-form-grid">
            <Form.Item name="sortOrder" label={t('ui.displayOrder')}>
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <div className="admin-model-switch-row">
              <span>
                <strong>{t('ui.defaultModel')}</strong>
                <small>
                  {model?.isDefault
                    ? t('ui.thisIsAlreadyTheDefaultModel')
                    : t('ui.usedForNewUsersOrWhenNoValidPreferenceIsSet')}
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
            label={t('ui.embeddingDimensions')}
            extra={t('ui.theCurrentPgvectorSchemaRequires1024Dimensions')}
          >
            <InputNumber min={1024} max={1024} disabled />
          </Form.Item>
        ) : null}

        {type === 'image' ? (
          <div className="admin-image-settings">
            <div>
              <strong>{t('ui.generationParameters')}</strong>
              <p>{t('ui.parametersAreSavedAlongsideTheModelIdentifier')}</p>
            </div>
            <Form.Item
              name={['settings', 'size']}
              label={t('ui.defaultImageSize')}
              rules={[
                { required: true },
                { pattern: /^\d+\*\d+$/, message: t('ui.useTheFormat10241024') }
              ]}
            >
              <Input placeholder="1024*1024" />
            </Form.Item>
            <label>
              <span>{t('ui.promptEnhancement')}</span>
              <Form.Item name={['settings', 'promptExtend']} valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </label>
            <label>
              <span>{t('ui.imageWatermark')}</span>
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
