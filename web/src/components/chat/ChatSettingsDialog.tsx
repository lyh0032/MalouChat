import { Button, Modal, Segmented, Select } from 'antd'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { ThemeMode } from '../../stores/theme'
import type { ModelInfo } from '../../types/chat'
import type { SpeechStyleInfo } from '../../types/auth'
import './ChatSettingsDialog.css'

type Props = {
  open: boolean
  themeMode: ThemeMode
  models: ModelInfo[]
  selectedModelId: string
  loadingModels: boolean
  speechStyles: SpeechStyleInfo[]
  selectedSpeechStyleId: string
  loadingSpeechStyles: boolean
  userDisplayName: string
  onClose: () => void
  onTheme: (mode: ThemeMode) => void
  onModel: (id: string) => void
  onSpeech: (id: string) => void
  onNavigate: (path: string) => void
  onLogout: () => void
}

export default function ChatSettingsDialog(props: Props) {
  const title = (
    <div className="chat-settings-titlebar">
      <span>设置</span>
      <div className="chat-settings-title-actions">
        <Button size="small" onClick={() => props.onNavigate('/architecture')}>
          技术架构
        </Button>
      </div>
    </div>
  )

  return (
    <Modal
      open={props.open}
      title={title}
      width={680}
      centered
      footer={null}
      onCancel={props.onClose}
    >
      <div className="chat-settings">
        <section>
          <h3>偏好设置</h3>
          <div className="chat-settings-row">
            <span>
              <strong>显示模式</strong>
              <small>选择界面的明暗外观</small>
            </span>
            <Segmented
              value={props.themeMode}
              options={[
                {
                  value: 'system',
                  label: (
                    <>
                      <DesktopOutlined /> 系统
                    </>
                  )
                },
                {
                  value: 'light',
                  label: (
                    <>
                      <SunOutlined /> 浅色
                    </>
                  )
                },
                {
                  value: 'dark',
                  label: (
                    <>
                      <MoonOutlined /> 深色
                    </>
                  )
                }
              ]}
              onChange={(value) => props.onTheme(value as ThemeMode)}
            />
          </div>
          <div className="chat-settings-row">
            <span>
              <strong>默认模型</strong>
              <small>用于新的对话生成</small>
            </span>
            <Select
              value={props.selectedModelId || undefined}
              loading={props.loadingModels}
              placeholder="选择模型"
              options={props.models.map((model) => ({ value: model.id, label: model.name }))}
              onChange={props.onModel}
            />
          </div>
          <div className="chat-settings-row">
            <span>
              <strong>基本风格和语调</strong>
              <small>控制回答时的整体表达方式</small>
            </span>
            <Select
              value={props.selectedSpeechStyleId || undefined}
              loading={props.loadingSpeechStyles}
              placeholder="选择风格"
              options={props.speechStyles.map((style) => ({ value: style.id, label: style.name }))}
              onChange={props.onSpeech}
            />
          </div>
        </section>
        <section>
          <h3>账户</h3>
          <div className="chat-settings-row">
            <span>
              <strong>当前账户</strong>
              <small>{props.userDisplayName}</small>
            </span>
            <Button onClick={props.onLogout}>退出登录</Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
