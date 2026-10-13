import { localizeErrorMessage } from '../../i18n/errors'
import { useTranslation } from 'react-i18next'
import { t, getUiLanguage } from '../../i18n'
import { FileTextOutlined } from '@ant-design/icons'
import { Modal } from 'antd'

import type { KnowledgeBaseRecord, KnowledgeBaseStatus } from '../../types/knowledge-base'

import './KnowledgeBaseModals.css'

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
  const statusLabels: Record<KnowledgeBaseStatus, string> = {
    queued: t('ui.queued'),
    processing: t('ui.processing'),
    completed: t('ui.completed'),
    failed: t('ui.processingFailed')
  }

  useTranslation()
  return (
    <Modal
      closable={{ 'aria-label': t('ui.close') }}
      open={Boolean(knowledgeBase)}
      title={t('ui.knowledgeBaseDetails')}
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
            <div className="knowledge-detail-error">
              {localizeErrorMessage(knowledgeBase.processingError, 'KNOWLEDGE_BASE_NOT_READY')}
            </div>
          ) : null}
          <section>
            <h4>{t('ui.description')}</h4>
            <p>{knowledgeBase.content}</p>
          </section>
          <section>
            <h4>{t('ui.attachmentDetails')}</h4>
            {knowledgeBase.attachmentName ? (
              <div className="knowledge-detail-attachment">
                <FileTextOutlined />
                <span>{knowledgeBase.attachmentName}</span>
                <small>{formatSize(knowledgeBase.attachmentSize)}</small>
              </div>
            ) : (
              <span className="knowledge-detail-muted">{t('ui.noAttachment')}</span>
            )}
          </section>
          <section>
            <h4>{t('ui.dates')}</h4>
            <span className="knowledge-detail-muted">
              {t('dates.created', {
                date: new Date(knowledgeBase.createdAt).toLocaleString(getUiLanguage())
              })}
            </span>
            <span className="knowledge-detail-muted">
              {t('dates.updated', {
                date: new Date(knowledgeBase.updatedAt).toLocaleString(getUiLanguage())
              })}
            </span>
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
