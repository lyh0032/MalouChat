import { FileTextOutlined } from '@ant-design/icons'
import { Modal } from 'antd'

import type { KnowledgeBaseRecord, KnowledgeBaseStatus } from '../../types/knowledge-base'

import './KnowledgeBaseModals.css'

const statusLabels: Record<KnowledgeBaseStatus, string> = {
  queued: '排队中',
  processing: '处理中',
  completed: '已完成',
  failed: '处理失败'
}

function formatSize(bytes: number | null) {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function KnowledgeBaseDetailModal({
  knowledgeBase,
  onClose
}: {
  knowledgeBase: KnowledgeBaseRecord | null
  onClose: () => void
}) {
  return (
    <Modal
      open={Boolean(knowledgeBase)}
      title="知识库详情"
      width={600}
      centered
      footer={null}
      onCancel={onClose}
    >
      {knowledgeBase ? (
        <div className="knowledge-detail">
          <div className="knowledge-detail-header">
            <strong>{knowledgeBase.title}</strong>
            <span
              className={`knowledge-detail-status knowledge-detail-status--${knowledgeBase.processingStatus}`}
            >
              {statusLabels[knowledgeBase.processingStatus]}
            </span>
          </div>
          {knowledgeBase.processingStatus === 'failed' && knowledgeBase.processingError ? (
            <div className="knowledge-detail-error">{knowledgeBase.processingError}</div>
          ) : null}
          <section>
            <h4>内容介绍</h4>
            <p>{knowledgeBase.content}</p>
          </section>
          <section>
            <h4>附件信息</h4>
            {knowledgeBase.attachmentName ? (
              <div className="knowledge-detail-attachment">
                <FileTextOutlined />
                <span>{knowledgeBase.attachmentName}</span>
                <small>{formatSize(knowledgeBase.attachmentSize)}</small>
              </div>
            ) : (
              <span className="knowledge-detail-muted">无附件</span>
            )}
          </section>
          <section>
            <h4>时间</h4>
            <span className="knowledge-detail-muted">
              创建于 {new Date(knowledgeBase.createdAt).toLocaleString()}
            </span>
            <span className="knowledge-detail-muted">
              更新于 {new Date(knowledgeBase.updatedAt).toLocaleString()}
            </span>
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
