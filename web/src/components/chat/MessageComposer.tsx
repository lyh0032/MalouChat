import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Button, Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import {
  AudioOutlined,
  CameraOutlined,
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  FileOutlined,
  FolderOpenOutlined,
  PauseOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
  UploadOutlined
} from '@ant-design/icons'

import { transcribeAudio } from '../../api/audio'
import {
  fetchConversationDraft,
  updateConversationDraftKnowledgeBase
} from '../../api/conversation-draft'
import { deleteFile, fetchPendingFiles, uploadFile, type UploadedFile } from '../../api/file'
import { attachLibraryAsset } from '../../api/library-asset'
import { useMobile } from '../../hooks/useMobile'
import { useChatStore } from '../../stores/chat'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base'
import { registerLocalFilePreview, releaseLocalFilePreview } from '../../utils/local-file-preview'
import ComposerAttachmentPreview, {
  type ComposerUploadingAttachment
} from './ComposerAttachmentPreview'
import LibraryAssetPickerDialog from './LibraryAssetPickerDialog'
import type { LibraryAsset } from '../../types/library-asset'

import './MessageComposer.css'

const DEEP_THINKING_STORAGE_KEY = 'my-agent:deep-thinking-enabled'
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024
const documentTokens = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.env',
  '.cfg',
  '.ini',
  '.toml',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.vue',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.swift',
  '.kt',
  '.scala',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.sql',
  '.graphql',
  '.proto'
]
const imageTokens = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']
const allAttachmentAccept = [...documentTokens, ...imageTokens, 'image/*'].join(',')

type Props = {
  loading: boolean
  canStop: boolean
  conversationId: string
  draftEnabled: boolean
  routeKey: string
  restoreRequest: { id: number; content: string; files: UploadedFile[] } | null
  onSubmit: (content: string, files: UploadedFile[], deepThinking: boolean) => Promise<boolean>
  onRestoreConsumed: () => void
  onCancel: () => void
  onDraftLoading: (loading: boolean) => void
}

function matches(file: File, tokens: string[]) {
  const name = file.name.toLowerCase()
  return tokens.some((token) => name.endsWith(token))
}

function validateFile(file: File) {
  if (file.size <= 0) return '文件内容为空，无法上传'
  if (file.size > MAX_UPLOAD_SIZE) return '文件大小不能超过 20MB'
  if (!matches(file, [...documentTokens, ...imageTokens])) return '暂不支持上传该文件格式'
  return ''
}

export default function MessageComposer(props: Props) {
  const { message } = AntApp.useApp()
  const isMobile = useMobile(640)
  const knowledgeBases = useKnowledgeBaseStore((state) => state.knowledgeBases)
  const selectedKnowledgeBaseId = useKnowledgeBaseStore((state) => state.selectedKnowledgeBaseId)
  const selectKnowledgeBase = useKnowledgeBaseStore((state) => state.selectKnowledgeBase)
  const clearKnowledgeBase = useKnowledgeBaseStore((state) => state.clearSelectedKnowledgeBase)
  const saveConversationKnowledgeBase = useChatStore((state) => state.saveConversationKnowledgeBase)
  const [content, setContent] = useState('')
  const [deepThinking, setDeepThinking] = useState(
    () => localStorage.getItem(DEEP_THINKING_STORAGE_KEY) === 'true'
  )
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [draftKnowledgeBaseId, setDraftKnowledgeBaseId] = useState('')
  const [uploading, setUploading] = useState<ComposerUploadingAttachment | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [attachingLibraryAsset, setAttachingLibraryAsset] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const allAttachmentInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const transcribeControllerRef = useRef<AbortController | null>(null)
  const loadSequenceRef = useRef(0)
  const selectedKnowledgeBase =
    knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null
  const availableKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => item.processingStatus === 'completed'),
    [knowledgeBases]
  )

  useEffect(() => {
    localStorage.setItem(DEEP_THINKING_STORAGE_KEY, deepThinking ? 'true' : 'false')
  }, [deepThinking])

  useEffect(() => {
    if (!props.restoreRequest) return
    setContent(props.restoreRequest.content)
    setFiles(props.restoreRequest.files)
    props.onRestoreConsumed()
  }, [props.restoreRequest, props.onRestoreConsumed])

  useEffect(() => {
    const sequence = ++loadSequenceRef.current
    setFiles([])
    if (props.loading) {
      props.onDraftLoading(false)
      return
    }
    if (!props.conversationId && !props.draftEnabled) return
    props.onDraftLoading(props.draftEnabled)
    void (async () => {
      try {
        if (props.conversationId) {
          const pending = await fetchPendingFiles(props.conversationId)
          if (sequence === loadSequenceRef.current) setFiles(pending)
        } else {
          const draft = await fetchConversationDraft()
          if (sequence !== loadSequenceRef.current) return
          setFiles(draft.file ? [draft.file] : [])
          setDraftKnowledgeBaseId(draft.knowledgeBaseId ?? '')
        }
      } finally {
        if (sequence === loadSequenceRef.current) props.onDraftLoading(false)
      }
    })()
  }, [props.conversationId, props.draftEnabled, props.loading, props.routeKey])

  useEffect(() => {
    if (!props.draftEnabled) return
    const canRestore = knowledgeBases.some(
      (item) => item.id === draftKnowledgeBaseId && item.processingStatus === 'completed'
    )
    if (draftKnowledgeBaseId && canRestore) selectKnowledgeBase(draftKnowledgeBaseId)
    else clearKnowledgeBase()
  }, [
    clearKnowledgeBase,
    draftKnowledgeBaseId,
    knowledgeBases,
    props.draftEnabled,
    selectKnowledgeBase
  ])

  useEffect(
    () => () => {
      transcribeControllerRef.current?.abort()
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    },
    []
  )

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  async function selectKb(id: string) {
    try {
      if (id === '__clear__') {
        setDraftKnowledgeBaseId('')
        clearKnowledgeBase()
        if (props.conversationId) await saveConversationKnowledgeBase(null)
        else if (props.draftEnabled) await updateConversationDraftKnowledgeBase(null)
        return
      }
      setDraftKnowledgeBaseId(id)
      selectKnowledgeBase(id)
      if (props.conversationId) await saveConversationKnowledgeBase(id)
      else if (props.draftEnabled) await updateConversationDraftKnowledgeBase(id)
    } catch {
      setDraftKnowledgeBaseId('')
      clearKnowledgeBase()
      void message.error('知识库关联失败，请重试')
    }
  }

  async function uploadSelected(file: File) {
    if (files.length || uploading) {
      void message.warning(uploading ? '已有文件正在上传，请稍候' : '当前已添加一个附件，请先移除')
      return
    }
    const error = validateFile(file)
    if (error) {
      void message.warning(error)
      return
    }
    const kind = matches(file, imageTokens) ? 'image' : 'file'
    const previewUrl =
      kind === 'image' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
    setUploading({ name: file.name, kind, previewUrl })
    setUploadProgress(0)
    try {
      const uploaded = await uploadFile(
        file,
        props.conversationId || undefined,
        setUploadProgress,
        undefined,
        props.draftEnabled
      )
      if (uploaded.kind === 'image') registerLocalFilePreview(uploaded, file)
      setFiles([uploaded])
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        void message.error(`文件 ${file.name} 上传失败`)
    } finally {
      setUploading(null)
      setUploadProgress(0)
      if (previewUrl) window.setTimeout(() => URL.revokeObjectURL(previewUrl), 0)
    }
  }

  async function removeAttachment() {
    const file = files[0]
    if (!file || deleting) return
    setDeleting(true)
    try {
      await deleteFile(file.id, {
        conversationId: props.conversationId || undefined,
        conversationDraft: props.draftEnabled
      })
      releaseLocalFilePreview(file)
      setFiles([])
    } catch {
      void message.error('删除文件失败')
    } finally {
      setDeleting(false)
    }
  }

  async function selectLibraryAsset(asset: LibraryAsset) {
    if (files.length || uploading || attachingLibraryAsset) return
    setAttachingLibraryAsset(true)
    try {
      const file = await attachLibraryAsset(asset.id, {
        conversationId: props.conversationId || undefined,
        conversationDraft: props.draftEnabled
      })
      setFiles([file])
      setLibraryPickerOpen(false)
    } catch {
      // Global HTTP handling already displays the server's precise failure reason.
    } finally {
      setAttachingLibraryAsset(false)
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files)
    if (!pasted.length) return
    event.preventDefault()
    if (files.length || uploading) {
      void message.warning('当前已有附件，请先移除后再粘贴')
      return
    }
    const supported = pasted.find((file) => !validateFile(file))
    if (!supported) {
      void message.warning(validateFile(pasted[0]))
      return
    }
    if (pasted.length > 1) void message.info('每次只能添加一个附件，已选择第一个支持的文件')
    void uploadSelected(supported)
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      void message.warning('当前浏览器不支持录音')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      chunksRef.current = []
      setRecordingSeconds(0)
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        const controller = new AbortController()
        transcribeControllerRef.current = controller
        setTranscribing(true)
        void transcribeAudio(blob, controller.signal)
          .then(setContent)
          .finally(() => {
            if (transcribeControllerRef.current === controller) {
              setTranscribing(false)
              transcribeControllerRef.current = null
            }
          })
      }
      recorder.start(250)
      setRecording(true)
    } catch {
      void message.error('无法访问麦克风，请允许麦克风权限')
    }
  }

  function submit() {
    const value = content.trim()
    if (!value || props.loading || uploading) return
    void props.onSubmit(value, files, deepThinking)
    setContent('')
    setFiles([])
  }

  const attachmentUnavailable = Boolean(uploading || files.length || attachingLibraryAsset)
  const selectedKnowledgeBaseMenuKey = selectedKnowledgeBaseId
    ? `knowledge-base:${selectedKnowledgeBaseId}`
    : ''
  const composerMenu: MenuProps = {
    items: [
      ...(isMobile
        ? [
            {
              key: 'camera',
              label: '相机',
              icon: <CameraOutlined />,
              disabled: attachmentUnavailable
            },
            {
              key: 'gallery',
              label: '图库',
              icon: <PictureOutlined />,
              disabled: attachmentUnavailable
            },
            {
              key: 'file',
              label: '文件',
              icon: <FileOutlined />,
              disabled: attachmentUnavailable
            }
          ]
        : [
            {
              key: 'upload',
              label: '上传图片或文件',
              icon: <UploadOutlined />,
              disabled: attachmentUnavailable
            }
          ]),
      {
        key: 'library',
        label: '从资料库添加',
        icon: <FolderOpenOutlined />,
        disabled: attachmentUnavailable
      },
      ...(availableKnowledgeBases.length
        ? [
            { type: 'divider' as const },
            {
              key: 'knowledge-bases',
              label: '选择知识库',
              icon: <DatabaseOutlined />,
              children: availableKnowledgeBases.map((kb) => ({
                key: `knowledge-base:${kb.id}`,
                label: (
                  <span className="composer-knowledge-option">
                    <span>{kb.title}</span>
                    {selectedKnowledgeBaseId === kb.id ? <CheckOutlined /> : null}
                  </span>
                )
              }))
            }
          ]
        : [])
    ],
    selectable: false,
    onClick: ({ key }) => {
      if (key === 'upload') allAttachmentInputRef.current?.click()
      else if (key === 'camera') cameraInputRef.current?.click()
      else if (key === 'gallery') imageInputRef.current?.click()
      else if (key === 'file') fileInputRef.current?.click()
      else if (key === 'library') setLibraryPickerOpen(true)
      else if (key.startsWith('knowledge-base:'))
        void selectKb(
          key === selectedKnowledgeBaseMenuKey ? '__clear__' : key.slice('knowledge-base:'.length)
        )
    }
  }
  const minutes = String(Math.floor(recordingSeconds / 60)).padStart(2, '0')
  const seconds = String(recordingSeconds % 60).padStart(2, '0')

  return (
    <div className="message-composer">
      {uploading || files[0] ? (
        <div
          className={`composer-attachment-row composer-attachment-row--${uploading?.kind ?? files[0]?.kind}`}
        >
          <ComposerAttachmentPreview
            file={files[0]}
            uploading={uploading}
            uploadProgress={uploadProgress}
            deleting={deleting}
            alwaysShowRemove={isMobile}
            onRemove={() => void removeAttachment()}
          />
        </div>
      ) : null}
      <Input.TextArea
        className="composer-input"
        value={content}
        autoSize={{ minRows: 2, maxRows: 5 }}
        placeholder={isMobile ? '输入问题...' : '请输入内容，回车发送，Shift + 回车换行'}
        onChange={(event) => setContent(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer-status">
        {recording ? `正在录音 ${minutes}:${seconds}` : transcribing ? '正在识别语音...' : ''}
      </div>
      <div className="composer-actions">
        <div className="composer-actions-left">
          <Dropdown trigger={['click']} menu={composerMenu}>
            <Button
              className="composer-icon-button"
              shape="circle"
              icon={<PlusOutlined />}
              aria-label="添加附件或知识库"
            />
          </Dropdown>
          {selectedKnowledgeBase ? (
            <div className="composer-chip composer-chip--kb" title={selectedKnowledgeBase.title}>
              <DatabaseOutlined />
              <b>{selectedKnowledgeBase.title}</b>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                aria-label="移除知识库"
                onClick={() => void selectKb('__clear__')}
              />
            </div>
          ) : null}
          <Button
            className={deepThinking ? 'composer-deep-thinking is-active' : 'composer-deep-thinking'}
            size="small"
            type={deepThinking ? 'primary' : 'default'}
            disabled={props.loading}
            onClick={() => setDeepThinking((value) => !value)}
          >
            深度思考
          </Button>
        </div>
        <div className="composer-actions-right">
          <span className="composer-hint">Shift + Enter 换行</span>
          <Button
            shape="circle"
            icon={<AudioOutlined />}
            aria-label={recording ? '停止录音' : '开始录音'}
            disabled={props.loading}
            danger={recording}
            onClick={() => void toggleRecording()}
          />
          {props.canStop ? (
            <Button
              danger
              shape="circle"
              icon={<PauseOutlined />}
              aria-label="停止生成"
              onClick={props.onCancel}
            />
          ) : (
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              aria-label="发送"
              disabled={!content.trim() || props.loading || Boolean(uploading)}
              onClick={submit}
            />
          )}
        </div>
      </div>
      <input
        ref={allAttachmentInputRef}
        hidden
        type="file"
        accept={allAttachmentAccept}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadSelected(file)
        }}
      />
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept={documentTokens.join(',')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadSelected(file)
        }}
      />
      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadSelected(file)
        }}
      />
      <input
        ref={cameraInputRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadSelected(file)
        }}
      />
      <LibraryAssetPickerDialog
        open={libraryPickerOpen}
        submitting={attachingLibraryAsset}
        onCancel={() => {
          if (!attachingLibraryAsset) setLibraryPickerOpen(false)
        }}
        onConfirm={(asset) => void selectLibraryAsset(asset)}
      />
    </div>
  )
}
