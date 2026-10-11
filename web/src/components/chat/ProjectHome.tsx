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
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export default function ProjectHome(props: Props) {
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
    const saved = await props.onUpdatePrompt(
      props.project.id,
      promptDraft.trim().slice(0, 500)
    )
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
          <p>在这个项目下开始新会话，或继续下面的历史会话。</p>
        </div>
      </header>

      <div className="project-home-tabs" role="tablist" aria-label="项目内容">
        <button
          className={`project-home-tab${activeTab === 'chat' ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
        >
          聊天
        </button>
        <button
          className={`project-home-tab${activeTab === 'prompt' ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'prompt'}
          onClick={() => setActiveTab('prompt')}
        >
          提示
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
                <span>{conversation.lastMessagePreview || '暂无消息'}</span>
              </span>
              <time>{formatConversationDate(conversation.updatedAt)}</time>
            </button>
          ))}
          {!props.conversations.length ? (
            <div className="project-home-empty">
              这个项目还没有历史会话。直接在下方输入，开始第一段项目对话。
            </div>
          ) : null}
        </div>
      ) : (
        <div className="project-home-prompt" role="tabpanel">
          {!editingPrompt ? (
            <div className="project-home-prompt-view">
              <div className="project-home-prompt-view-header">
                <span>项目提示词</span>
                <Button type="text" size="small" onClick={() => setEditingPrompt(true)}>
                  编辑提示
                </Button>
              </div>
              <p className={props.project.prompt ? 'project-home-prompt-text' : 'project-home-prompt-empty'}>
                {props.project.prompt ||
                  '还没有设置提示词。添加后，项目下所有会话都会自动携带这段提示。'}
              </p>
            </div>
          ) : (
            <div className="project-home-prompt-edit">
              <div className="project-home-prompt-header">
                <span>编辑项目提示词</span>
                <span>{promptDraft.length}/500</span>
              </div>
              <Input.TextArea
                value={promptDraft}
                maxLength={500}
                rows={8}
                placeholder="为这个项目设置长期提示词，例如回答语言、角色、格式或风格要求。"
                onChange={(event) => setPromptDraft(event.target.value)}
              />
              <div className="project-home-prompt-actions">
                <span>项目下所有会话都会自动携带这段提示词。</span>
                <div className="project-home-prompt-buttons">
                  <Button onClick={cancelPromptEdit}>取消</Button>
                  <Button
                    type="primary"
                    loading={props.savingPrompt}
                    disabled={!promptChanged}
                    onClick={() => void savePrompt()}
                  >
                    保存提示
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
