import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { useEffect, useState } from 'react'
import { Button, Image, Progress, Spin } from 'antd'
import { CloseOutlined, FileOutlined } from '@ant-design/icons'

import type { UploadedFile } from '../../api/file'
import { resolveFileUrl } from '../../utils/file-url-resolver'
import { getLocalFilePreview } from '../../utils/local-file-preview'

export type ComposerUploadingAttachment = {
  name: string
  kind: 'image' | 'file'
  previewUrl: string
}

type Props = {
  file?: UploadedFile
  uploading: ComposerUploadingAttachment | null
  uploadProgress: number
  deleting: boolean
  alwaysShowRemove: boolean
  onRemove: () => void
}

export default function ComposerAttachmentPreview({
  file,
  uploading,
  uploadProgress,
  deleting,
  alwaysShowRemove,
  onRemove
}: Props) {
  useTranslation()
  const attachment = uploading ?? file
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState('')

  useEffect(() => {
    let active = true

    if (!attachment || attachment.kind !== 'image') {
      setResolvedPreviewUrl('')
      return () => {
        active = false
      }
    }

    if (uploading) {
      setResolvedPreviewUrl(uploading.previewUrl)
      return () => {
        active = false
      }
    }

    if (!file) return
    const localPreviewUrl = getLocalFilePreview(file)
    if (localPreviewUrl) {
      setResolvedPreviewUrl(localPreviewUrl)
      return () => {
        active = false
      }
    }

    setResolvedPreviewUrl('')
    void resolveFileUrl(file.storageKey, 'preview', file.originalName)
      .then((url) => {
        if (active) setResolvedPreviewUrl(url)
      })
      .catch(() => {
        if (active) setResolvedPreviewUrl('')
      })

    return () => {
      active = false
    }
  }, [attachment, file, uploading])

  if (!attachment) return null

  const isImage = attachment.kind === 'image'
  const name = uploading?.name ?? file?.originalName ?? t('ui.attachment')

  return (
    <div
      className={`composer-attachment-card composer-attachment-card--${isImage ? 'image' : 'file'}${alwaysShowRemove ? ' is-mobile' : ''}`}
      aria-label={t('ui.valueValue', {
        v0: isImage ? t('ui.images') : t('ui.attachment'),
        v1: name
      })}
    >
      {isImage ? (
        <div className="composer-attachment-media">
          {resolvedPreviewUrl ? (
            <Image
              src={resolvedPreviewUrl}
              alt={name}
              width="100%"
              height="100%"
              preview={uploading ? false : true}
            />
          ) : (
            <Spin size="small" />
          )}
        </div>
      ) : (
        <div className="composer-attachment-file-content">
          <span className="composer-attachment-file-icon">
            <FileOutlined />
          </span>
          <strong>{name}</strong>
        </div>
      )}

      {uploading ? (
        <div
          className="composer-attachment-progress"
          aria-label={t('ui.uploadingValue', { v0: uploadProgress })}
        >
          <Progress
            type="circle"
            percent={uploadProgress}
            size={36}
            strokeWidth={8}
            showInfo={false}
          />
        </div>
      ) : file ? (
        <Button
          className="composer-attachment-remove"
          type="text"
          loading={deleting}
          icon={<CloseOutlined />}
          aria-label={t('ui.removeAttachment')}
          onClick={onRemove}
        />
      ) : null}
    </div>
  )
}
