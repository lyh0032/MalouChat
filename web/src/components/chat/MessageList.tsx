import { Fragment, useEffect, useMemo, useState } from 'react'
import 'highlight.js/styles/github-dark-dimmed.css'
import { App as AntApp, Button, Image, Input, Modal, Spin } from 'antd'
import {
  CodeOutlined,
  CoffeeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  ReloadOutlined,
  ToolOutlined
} from '@ant-design/icons'

import type { Message, MessageFile, StreamAssistantStatus } from '../../types/chat'
import {
  extractMarkdownImages,
  markdownToPlainText,
  renderMarkdownWithoutFileLinks,
  type MarkdownImageAsset
} from '../../utils/markdown'
import { resolveFileUrl } from '../../utils/file-url-resolver'
import { getLocalFilePreview } from '../../utils/local-file-preview'
import { canEditLastUserMessage } from '../../utils/message-edit'
import MalouBrand from '../MalouBrand'
import ThinkingOrb from '../common/ThinkingOrb'
import {
  selectVisibleSuggestions,
  usePromptSuggestionsStore
} from '../../stores/prompt-suggestions'

import './MessageList.css'

function download(href: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function FileAttachment({ file }: { file: MessageFile }) {
  return (
    <button
      className="message-attachment-file"
      type="button"
      onClick={() =>
        void resolveFileUrl(file.storageKey, 'download', file.name).then((href) =>
          download(href, file.name)
        )
      }
    >
      <FileOutlined />
      <span>
        <strong>{file.name}</strong>
        {file.size ? <small>{(file.size / 1024).toFixed(1)} KB</small> : null}
      </span>
    </button>
  )
}

type ResolvedImageAsset = MarkdownImageAsset & {
  id?: string
  storageKey?: string
  name: string
}

function MessageImage({ image }: { image: ResolvedImageAsset }) {
  const [url, setUrl] = useState(() => getLocalFilePreview(image) ?? image.url ?? '')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (!image.storageKey) {
      setUrl(image.url ?? '')
      return () => {
        active = false
      }
    }
    const localPreviewUrl = getLocalFilePreview(image)
    if (localPreviewUrl) {
      setUrl(localPreviewUrl)
      return () => {
        active = false
      }
    }

    setUrl('')
    void resolveFileUrl(image.storageKey, 'preview', image.name)
      .then((value) => {
        if (active) setUrl(value)
      })
      .catch(() => {
        if (active) setUrl('')
      })
    return () => {
      active = false
    }
  }, [image.id, image.name, image.storageKey, image.url])

  return (
    <div className="message-image-wrap">
      <div className="message-attachment-image">
        {url ? (
          <Image
            src={url}
            alt={image.alt || image.name}
            width={140}
            height={140}
            preview={{ open: previewOpen, onOpenChange: setPreviewOpen }}
          />
        ) : (
          <Spin />
        )}
      </div>
    </div>
  )
}

type Props = {
  messages: Message[]
  loading: boolean
  streaming: boolean
  locked: boolean
  thinkingText: string
  streamingStatus: StreamAssistantStatus | null
  submittingPrompt: string
  onPrompt: (content: string) => void
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
}

const promptCategoryIcons = {
  life: <CoffeeOutlined />,
  technology: <CodeOutlined />,
  tools: <ToolOutlined />
}

const PENDING_ASSISTANT_MESSAGE_ID = 'pending-assistant'

export default function MessageList(props: Props) {
  const { message: toast, modal } = AntApp.useApp()
  const categoryStates = usePromptSuggestionsStore((state) => state.categoryStates)
  const suggestionBatchKey = usePromptSuggestionsStore((state) => state.batchKey)
  const suggestions = useMemo(() => selectVisibleSuggestions({ categoryStates }), [categoryStates])
  const showNextBatch = usePromptSuggestionsStore((state) => state.showNextBatch)
  const [suggestionTransition, setSuggestionTransition] = useState<'idle' | 'leaving' | 'entering'>(
    'idle'
  )
  const [editing, setEditing] = useState<Message | null>(null)
  const [editContent, setEditContent] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const displayMessages = useMemo(() => {
    const hasGeneratingAssistant = props.messages.some(
      (item) => item.role === 'assistant' && item.status === 'generating'
    )
    if (!props.streaming || hasGeneratingAssistant) return props.messages

    let lastUserMessage: Message | undefined
    for (let index = props.messages.length - 1; index >= 0; index -= 1) {
      if (props.messages[index].role === 'user') {
        lastUserMessage = props.messages[index]
        break
      }
    }
    const createdAt = lastUserMessage?.createdAt ?? new Date().toISOString()
    const pendingAssistant: Message = {
      id: PENDING_ASSISTANT_MESSAGE_ID,
      conversationId: lastUserMessage?.conversationId ?? '',
      role: 'assistant',
      content: '',
      fileList: [],
      status: 'generating',
      type: 'text',
      createdAt,
      updatedAt: createdAt
    }

    return [...props.messages, pendingAssistant]
  }, [props.messages, props.streaming])
  const rendered = useMemo(
    () =>
      new Map(
        props.messages
          .filter((item) => item.role === 'assistant')
          .map((item) => [item.id, renderMarkdownWithoutFileLinks(item.content, item.fileList)])
      ),
    [props.messages]
  )

  function messageImages(item: Message): ResolvedImageAsset[] {
    const attachedImages = item.fileList.filter((file) => file.kind === 'image')
    return attachedImages.length
      ? attachedImages.map((file) => ({ ...file, alt: file.name, kind: 'image' as const }))
      : extractMarkdownImages(item.content)
  }

  function handleMarkdownClick(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest(
      '.code-block-copy'
    ) as HTMLButtonElement | null
    if (!button) return
    const code = button.closest('.code-block')?.querySelector('code')?.textContent
    if (!code) return
    event.stopPropagation()
    void navigator.clipboard.writeText(code).then(() => {
      const label = button.textContent
      button.textContent = '已复制'
      window.setTimeout(() => {
        button.textContent = label
      }, 1500)
      void toast.success('代码已复制')
    })
  }

  function imageFilename(item: Message, image: ResolvedImageAsset, index: number) {
    return `generated-${item.id}-${index + 1}.${image.storageKey?.split('.').pop()?.split('?')[0] || 'png'}`
  }

  async function imageUrl(
    image: ResolvedImageAsset,
    mode: 'preview' | 'download',
    filename: string
  ) {
    const href = image.storageKey
      ? await resolveFileUrl(image.storageKey, mode, filename)
      : image.url
    if (!href) throw new Error('missing image URL')
    return href
  }

  async function previewImage(image: ResolvedImageAsset, filename: string) {
    try {
      setPreviewUrl(await imageUrl(image, 'preview', filename))
    } catch {
      void toast.error('图片地址获取失败')
    }
  }

  async function downloadImage(image: ResolvedImageAsset, filename: string) {
    try {
      download(await imageUrl(image, 'download', filename), filename)
    } catch {
      void toast.error('图片地址获取失败')
    }
  }

  function confirmDeleteMessage(item: Message) {
    modal.confirm({
      title: '删除消息',
      content: '确认删除这条消息吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => props.onDelete(item.id)
    })
  }

  function refreshPromptSuggestions() {
    if (suggestionTransition !== 'idle' || props.submittingPrompt) return
    setSuggestionTransition('leaving')
  }

  function handleSuggestionAnimationEnd(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (suggestionTransition === 'leaving') {
      showNextBatch()
      setSuggestionTransition('entering')
    } else if (suggestionTransition === 'entering') {
      setSuggestionTransition('idle')
    }
  }

  if (props.loading)
    return (
      <div className="message-list message-list--skeleton" aria-label="正在加载消息">
        <div className="message-skeleton message-skeleton--user" aria-hidden="true">
          <div className="message-skeleton-bubble message-skeleton-bubble--user">
            <div className="message-skeleton-role">
              <span className="message-skeleton-role-name chat-loading-shimmer" />
              <span className="message-skeleton-time chat-loading-shimmer" />
            </div>
            <span className="message-skeleton-line is-user chat-loading-shimmer" />
          </div>
          <div className="message-skeleton-actions">
            <span className="message-skeleton-action chat-loading-shimmer" />
            <span className="message-skeleton-action chat-loading-shimmer" />
          </div>
        </div>
        <div className="message-skeleton message-skeleton--assistant" aria-hidden="true">
          <div className="message-skeleton-bubble message-skeleton-bubble--assistant">
            <div className="message-skeleton-role">
              <span className="message-skeleton-avatar chat-loading-shimmer" />
              <span className="message-skeleton-role-name is-assistant chat-loading-shimmer" />
              <span className="message-skeleton-time chat-loading-shimmer" />
            </div>
            <div className="message-skeleton-copy">
              <span className="message-skeleton-line is-wide chat-loading-shimmer" />
              <span className="message-skeleton-line is-medium chat-loading-shimmer" />
              <span className="message-skeleton-line is-full chat-loading-shimmer" />
              <span className="message-skeleton-line is-short chat-loading-shimmer" />
            </div>
          </div>
          <div className="message-skeleton-actions">
            <span className="message-skeleton-action chat-loading-shimmer" />
            <span className="message-skeleton-action chat-loading-shimmer" />
          </div>
        </div>
      </div>
    )
  if (!props.messages.length && !props.streaming)
    return (
      <div className="message-empty">
        <h2>开始一段新对话</h2>
        <p>选择一个问题快速开始，或者直接在下方输入。</p>
        <div className="message-empty-heading">
          <span>试试这些问题</span>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={suggestionTransition !== 'idle'} />}
            disabled={Boolean(props.submittingPrompt) || suggestionTransition !== 'idle'}
            onClick={refreshPromptSuggestions}
          >
            换一批
          </Button>
        </div>
        <div
          key={suggestionBatchKey}
          className={`message-empty-suggestion-grid${suggestionTransition === 'leaving' ? ' motion-animated fadeOut motion-duration-quick' : suggestionTransition === 'entering' ? ' motion-animated fadeIn motion-duration-standard' : ''}`}
          onAnimationEnd={handleSuggestionAnimationEnd}
        >
          {suggestions.map((item, index) => (
            <button
              key={item.id}
              className={
                suggestionTransition === 'entering'
                  ? 'motion-animated fadeInUp motion-duration-standard'
                  : ''
              }
              style={
                suggestionTransition === 'entering'
                  ? { animationDelay: `${index * 30}ms` }
                  : undefined
              }
              type="button"
              disabled={Boolean(props.submittingPrompt) || suggestionTransition !== 'idle'}
              onClick={() => props.onPrompt(item.prompt)}
            >
              <small>
                <i>{promptCategoryIcons[item.id]}</i>
                {item.label}
              </small>
              <span>{item.prompt}</span>
              {props.submittingPrompt === item.prompt ? <Spin size="small" /> : null}
            </button>
          ))}
        </div>
      </div>
    )

  return (
    <div className="message-list">
      {displayMessages.map((item) => {
        const images = messageImages(item)
        const isAssistantImage = item.role === 'assistant' && item.type === 'image'
        const isPendingAssistant = item.id === PENDING_ASSISTANT_MESSAGE_ID
        return (
          <article
            id={`message-${item.id}`}
            key={item.id}
            className={`message-wrapper message-wrapper--${item.role}`}
            aria-live={isPendingAssistant ? 'polite' : undefined}
          >
            <div
              className={`message-bubble message-bubble--${item.role}${isAssistantImage ? ' message-bubble--image' : ''}`}
            >
              <header className="message-bubble-role">
                {item.role === 'assistant' ? (
                  <MalouBrand compact name="Malou" />
                ) : (
                  <strong>你</strong>
                )}
                <time>{new Date(item.createdAt).toLocaleString()}</time>
              </header>
              {item.deepThinkingEnabled &&
              (item.reasoningContent || item.reasoningStatus === 'thinking') ? (
                <details className="message-reasoning" open={item.reasoningStatus === 'thinking'}>
                  <summary>
                    {item.reasoningStatus === 'thinking' ? '正在深度思考' : '已完成思考'}
                  </summary>
                  {item.reasoningContent ? (
                    <p>{item.reasoningContent}</p>
                  ) : (
                    <span>
                      <ThinkingOrb size={18} /> 正在分析...
                    </span>
                  )}
                </details>
              ) : null}
              {item.fileList.some((file) => file.kind !== 'image') ? (
                <div className="message-attachments">
                  {item.fileList
                    .filter((file) => file.kind !== 'image')
                    .map((file, index) => (
                      <FileAttachment key={file.id ?? `${file.storageKey}-${index}`} file={file} />
                    ))}
                </div>
              ) : null}
              {item.role === 'assistant' && item.type !== 'image' ? (
                <div
                  className="message-markdown"
                  onClick={handleMarkdownClick}
                  dangerouslySetInnerHTML={{ __html: rendered.get(item.id) ?? '' }}
                />
              ) : item.role !== 'assistant' ? (
                <p className="message-user-text">{item.content}</p>
              ) : null}
              {images.length ? (
                <div className="message-images">
                  {images.map((image, index) => (
                    <MessageImage key={`${image.storageKey || image.url}-${index}`} image={image} />
                  ))}
                </div>
              ) : null}
              {item.role === 'assistant' &&
              item.status === 'generating' &&
              (!item.content || item.type === 'image') ? (
                <div className="message-thinking">
                  <ThinkingOrb />
                  <span>
                    {item.type === 'image'
                      ? '正在生成图片...'
                      : props.thinkingText || '正在思考...'}
                  </span>
                </div>
              ) : null}
            </div>
            <footer className="message-actions">
              {isAssistantImage ? (
                images.map((image, index) => (
                  <Fragment key={`${image.storageKey || image.url}-actions-${index}`}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      aria-label="预览图片"
                      onClick={() => void previewImage(image, imageFilename(item, image, index))}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<DownloadOutlined />}
                      aria-label="下载图片"
                      onClick={() => void downloadImage(image, imageFilename(item, image, index))}
                    />
                  </Fragment>
                ))
              ) : (
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  aria-label="复制"
                  disabled={isPendingAssistant}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(markdownToPlainText(item.content))
                      .then(() => toast.success('已复制'))
                  }
                />
              )}
              {canEditLastUserMessage(props.messages, item, props.locked) ? (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label="编辑"
                  onClick={() => {
                    setEditing(item)
                    setEditContent(item.content)
                  }}
                />
              ) : null}
              {item.status !== 'generating' ? (
                <Button
                  type="text"
                  size="small"
                  disabled={props.locked}
                  icon={<DeleteOutlined />}
                  aria-label="删除"
                  onClick={() => confirmDeleteMessage(item)}
                />
              ) : null}
            </footer>
          </article>
        )
      })}
      <Modal
        open={Boolean(editing)}
        title="编辑消息并重新生成"
        width={560}
        centered
        okText="重新生成"
        cancelText="取消"
        okButtonProps={{ disabled: !editContent.trim() }}
        onOk={() => {
          if (editing) props.onEdit(editing.id, editContent.trim())
          setEditing(null)
        }}
        onCancel={() => setEditing(null)}
      >
        <Input.TextArea
          value={editContent}
          rows={6}
          onChange={(event) => setEditContent(event.target.value)}
        />
      </Modal>
      {previewUrl ? (
        <div className="message-hidden-preview">
          <Image
            src={previewUrl}
            preview={{
              open: true,
              src: previewUrl,
              onOpenChange: (open) => {
                if (!open) setPreviewUrl('')
              }
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
