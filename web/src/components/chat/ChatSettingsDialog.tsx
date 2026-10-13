import { useTranslation } from 'react-i18next'
import { Button, Modal, Segmented, Select } from 'antd'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { ThemeMode } from '../../stores/theme'
import type { ModelInfo } from '../../types/chat'
import type { SpeechStyleInfo } from '../../types/auth'
import LanguageSelect from '../LanguageSelect'
import { t } from '../../i18n'
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
  useTranslation()
  const title = (
    <div className="chat-settings-titlebar">
      <span>{t('ui.settings')}</span>
      <div className="chat-settings-title-actions">
        <Button size="small" onClick={() => props.onNavigate('/architecture')}>
          {t('ui.architecture')}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal
      closable={{ 'aria-label': t('ui.close') }}
      open={props.open}
      title={title}
      width={680}
      centered
      footer={null}
      onCancel={props.onClose}
    >
      <div className="chat-settings">
        <section>
          <h3>{t('ui.preferences')}</h3>
          <div className="chat-settings-row">
            <span>
              <strong>{t('settings.language')}</strong>
              <small>{t('settings.languageDescription')}</small>
            </span>
            <LanguageSelect />
          </div>
          <div className="chat-settings-row">
            <span>
              <strong>{t('ui.appearance')}</strong>
              <small>{t('ui.chooseTheLightOrDarkAppearance')}</small>
            </span>
            <Segmented
              value={props.themeMode}
              options={[
                {
                  value: 'system',
                  label: (
                    <>
                      <DesktopOutlined /> {t('ui.system')}
                    </>
                  )
                },
                {
                  value: 'light',
                  label: (
                    <>
                      <SunOutlined /> {t('ui.light')}
                    </>
                  )
                },
                {
                  value: 'dark',
                  label: (
                    <>
                      <MoonOutlined /> {t('ui.dark')}
                    </>
                  )
                }
              ]}
              onChange={(value) => props.onTheme(value as ThemeMode)}
            />
          </div>
          <div className="chat-settings-row">
            <span>
              <strong>{t('ui.defaultModel')}</strong>
              <small>{t('ui.usedForNewConversations')}</small>
            </span>
            <Select
              value={props.selectedModelId || undefined}
              loading={props.loadingModels}
              placeholder={t('ui.selectAModel')}
              options={props.models.map((model) => ({ value: model.id, label: model.name }))}
              onChange={props.onModel}
            />
          </div>
          <div className="chat-settings-row">
            <span>
              <strong>{t('ui.responseStyleAndTone')}</strong>
              <small>{t('ui.chooseHowResponsesArePhrased')}</small>
            </span>
            <Select
              value={props.selectedSpeechStyleId || undefined}
              loading={props.loadingSpeechStyles}
              placeholder={t('ui.selectAStyle')}
              options={props.speechStyles.map((style) => ({
                value: style.id,
                label: t(`speechStyles.${style.id}`, { defaultValue: style.name })
              }))}
              onChange={props.onSpeech}
            />
          </div>
        </section>
        <section>
          <h3>{t('ui.account')}</h3>
          <div className="chat-settings-row">
            <span>
              <strong>{t('ui.currentAccount')}</strong>
              <small>{props.userDisplayName}</small>
            </span>
            <Button onClick={props.onLogout}>{t('ui.signOut')}</Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
