import { useTranslation } from 'react-i18next'
import { t, getUiLanguage } from '../../i18n'
import { useEffect, useState } from 'react'
import { Button, Input } from 'antd'

import type { ConversationSummary } from '../../types/chat'
import type { ProjectRecord } from '../../types/project'
import ProjectIcon from './ProjectIcon'

import './ProjectHome.css'

type Props = {
  project: ProjectRecord
  conversations: ConversationSummary[]
  savingPrompt: boolean
  onSelectConversation: (id: string) => void
  onUpdatePrompt: (id: string, prompt: string) => Promise<boolean>
}

function formatConversationDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getUiLanguage(), { month: 'short', day: 'numeric' }).format(date)
}

export default function ProjectHome(props: Props) {
  useTranslation()
  const [activeTab, setActiveTab] = useState<'chat' | 'prompt'>('chat')
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(props.project.prompt ?? '')
  const promptChanged = promptDraft.trim() !== (props.project.prompt ?? '').trim()

  useEffect(() => {
    setActiveTab('chat')
    setEditingPrompt(false)
    setPromptDraft(props.project.prompt ?? '')
  }, [props.project.id])

  useEffect(() => {
    if (!editingPrompt) setPromptDraft(props.project.prompt ?? '')
  }, [editingPrompt, props.project.prompt])

  async function savePrompt() {
    if (!promptChanged || props.savingPrompt) return
    const saved = await props.onUpdatePrompt(props.project.id, promptDraft.trim().slice(0, 500))
    if (saved) setEditingPrompt(false)
  }

  function cancelPromptEdit() {
    setPromptDraft(props.project.prompt ?? '')
    setEditingPrompt(false)
  }

  return (
    <section className="project-home">
      <header className="project-home-heading">
        <span className="project-home-icon" style={{ color: props.project.iconColor }}>
          <ProjectIcon name={props.project.icon} />
        </span>
        <div className="project-home-title">
          <h2>{props.project.title}</h2>
          <p>{t('ui.startANewConversationInThisProjectOrContinueAPrevious')}</p>
        </div>
      </header>

      <div className="project-home-tabs" role="tablist" aria-label={t('ui.projectContent')}>
        <button
          className={`project-home-tab${activeTab === 'chat' ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
        >
          {t('ui.chat')}
        </button>
        <button
          className={`project-home-tab${activeTab === 'prompt' ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'prompt'}
          onClick={() => setActiveTab('prompt')}
        >
          {t('ui.instructions2')}
        </button>
      </div>

      {activeTab === 'chat' ? (
        <div className="project-home-conversations" role="tabpanel">
          {props.conversations.map((conversation) => (
            <button
              key={conversation.id}
              className="project-home-conversation"
              type="button"
              onClick={() => props.onSelectConversation(conversation.id)}
            >
              <span className="project-home-conversation-main">
                <strong>{conversation.title}</strong>
                <span>{conversation.lastMessagePreview || t('ui.noMessagesYet')}</span>
              </span>
              <time>{formatConversationDate(conversation.updatedAt)}</time>
            </button>
          ))}
          {!props.conversations.length ? (
            <div className="project-home-empty">
              {t('ui.noConversationsInThisProjectYetTypeBelowToStartThe')}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="project-home-prompt" role="tabpanel">
          {!editingPrompt ? (
            <div className="project-home-prompt-view">
              <div className="project-home-prompt-view-header">
                <span>{t('ui.projectInstructions')}</span>
                <Button type="text" size="small" onClick={() => setEditingPrompt(true)}>
                  {t('ui.editInstructions')}
                </Button>
              </div>
              <p
                className={
                  props.project.prompt ? 'project-home-prompt-text' : 'project-home-prompt-empty'
                }
              >
                {props.project.prompt ||
                  t('ui.noInstructionsYetAddInstructionsToApplyThemToEveryConversation')}
              </p>
            </div>
          ) : (
            <div className="project-home-prompt-edit">
              <div className="project-home-prompt-header">
                <span>{t('ui.editProjectInstructions')}</span>
                <span>{promptDraft.length}/500</span>
              </div>
              <Input.TextArea
                value={promptDraft}
                maxLength={500}
                rows={8}
                placeholder={t('ui.setOngoingInstructionsSuchAsResponseLanguageRoleFormatOrStyle')}
                onChange={(event) => setPromptDraft(event.target.value)}
              />
              <div className="project-home-prompt-actions">
                <span>{t('ui.theseInstructionsApplyToEveryConversationInThisProject')}</span>
                <div className="project-home-prompt-buttons">
                  <Button onClick={cancelPromptEdit}>{t('ui.cancel')}</Button>
                  <Button
                    type="primary"
                    loading={props.savingPrompt}
                    disabled={!promptChanged}
                    onClick={() => void savePrompt()}
                  >
                    {t('ui.saveInstructions')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
