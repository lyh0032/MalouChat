import { localizeErrorMessage } from '../i18n/errors'
import { useTranslation } from 'react-i18next'
import { t, getUiLanguage } from '../i18n'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { App as AntApp, Button, Empty, Image, Segmented, Spin, Table, Tag, Tooltip } from 'antd'
import {
  CommentOutlined,
  DeleteOutlined,
  FileImageOutlined,
  FileOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PictureOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

import ManagementSidebar from '../components/management/ManagementSidebar'
import ManagementSidebarToggle from '../components/management/ManagementSidebarToggle'
import { useMobile } from '../hooks/useMobile'
import { getLastChatRoute } from '../router/chat-route-cache'
import { useLibraryAssetStore } from '../stores/library-asset'
import type { LibraryAsset, LibraryAssetCategory } from '../types/library-asset'
import { resolveFileUrl } from '../utils/file-url-resolver'

import './LibraryAssetView.css'
import '../components/management/ManagementPageLayout.css'

type CategoryFilter = 'all' | LibraryAssetCategory

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getUiLanguage(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function categoryIcon(category: LibraryAssetCategory): ReactNode {
  if (category === 'user_image') return <FileImageOutlined />
  if (category === 'generated_image') return <PictureOutlined />
  if (category === 'knowledge_base_attachment') return <FolderOpenOutlined />
  return <FileOutlined />
}

function isPreviewableImage(asset: LibraryAsset) {
  return asset.category === 'user_image' || asset.category === 'generated_image'
}

export default function LibraryAssetView() {
  const categoryOptions: Array<{ label: string; value: CategoryFilter }> = [
    { label: t('ui.all'), value: 'all' },
    { label: t('ui.files'), value: 'user_file' },
    { label: t('ui.images'), value: 'user_image' },
    { label: t('ui.generatedImages'), value: 'generated_image' },
    { label: t('ui.knowledgeBases'), value: 'knowledge_base_attachment' }
  ]

  const { i18n: uiI18n } = useTranslation()
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const isMobile = useMobile()
  const assets = useLibraryAssetStore((state) => state.assets)
  const isLoading = useLibraryAssetStore((state) => state.isLoading)
  const loadAssets = useLibraryAssetStore((state) => state.loadAssets)
  const deleteAsset = useLibraryAssetStore((state) => state.deleteAsset)
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [deletingId, setDeletingId] = useState('')
  const [previewLoadingId, setPreviewLoadingId] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState('')

  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    void loadAssets(true)
  }, [loadAssets])

  const filteredAssets = useMemo(
    () =>
      categoryFilter === 'all'
        ? assets
        : assets.filter((asset) => asset.category === categoryFilter),
    [assets, categoryFilter]
  )

  const categoryStats = useMemo(() => {
    const counts = new Map<LibraryAssetCategory, number>()
    assets.forEach((asset) => counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1))
    return categoryOptions.slice(1).map((option) => ({
      label: option.label,
      count: counts.get(option.value as LibraryAssetCategory) ?? 0
    }))
  }, [assets, uiI18n.language])

  function returnToChat() {
    navigate(getLastChatRoute())
  }

  async function downloadAsset(asset: LibraryAsset) {
    const url = await resolveFileUrl(asset.storageKey, 'download', asset.fileName)
    const link = document.createElement('a')
    link.href = url
    link.download = asset.fileName
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function openAsset(asset: LibraryAsset) {
    if (!isPreviewableImage(asset)) {
      await downloadAsset(asset)
      return
    }

    setPreviewLoadingId(asset.id)
    try {
      setPreviewImageUrl(await resolveFileUrl(asset.storageKey, 'preview', asset.fileName))
    } finally {
      setPreviewLoadingId('')
    }
  }

  function openConversation(reference: LibraryAsset['conversationReferences'][number]) {
    if (reference.type === 'draft') {
      navigate('/chat')
      return
    }
    if (reference.conversationId)
      navigate(`/chat?conversationId=${encodeURIComponent(reference.conversationId)}`)
  }

  function renderConversationReferences(asset: LibraryAsset) {
    if (!asset.conversationReferences.length) {
      return <span className="library-empty-text">-</span>
    }

    return (
      <div className="library-conversation-links">
        {asset.conversationReferences.map((reference) => (
          <Button
            key={`${reference.type}:${reference.conversationId ?? 'draft'}`}
            className="library-conversation-link"
            type="link"
            icon={<CommentOutlined />}
            onClick={() => openConversation(reference)}
          >
            {reference.conversationTitle}
          </Button>
        ))}
      </div>
    )
  }

  function confirmDelete(asset: LibraryAsset) {
    if (!asset.deletable) {
      void message.warning(
        localizeErrorMessage(
          asset.deleteBlockedReason || t('ui.thisAssetCannotBeDeleted'),
          'LIBRARY_ASSET_IN_USE'
        )
      )
      return
    }

    modal.confirm({
      title: t('ui.deleteAsset'),
      content: t('ui.deleteValue', { v0: asset.fileName }),
      okText: t('ui.delete'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        setDeletingId(asset.id)
        try {
          await deleteAsset(asset.id)
          void message.success(t('ui.assetDeleted'))
        } finally {
          setDeletingId('')
        }
      }
    })
  }

  const sidebarStats = categoryStats.map((item) => (
    <article key={item.label} className="management-sidebar-stat">
      <span>{item.label}</span>
      <strong>{item.count}</strong>
    </article>
  ))

  const columns = [
    {
      title: t('ui.fileName'),
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (_: string, asset: LibraryAsset) => (
        <div className="library-file-cell">
          <span className={`library-file-icon library-file-icon--${asset.category}`}>
            {categoryIcon(asset.category)}
          </span>
          <Button
            type="link"
            loading={previewLoadingId === asset.id}
            onClick={() => void openAsset(asset)}
          >
            {asset.fileName}
          </Button>
        </div>
      )
    },
    {
      title: t('ui.linkedConversations'),
      key: 'conversationTitle',
      width: 260,
      render: (_: unknown, asset: LibraryAsset) => renderConversationReferences(asset)
    },
    {
      title: t('ui.fileSize'),
      key: 'size',
      width: 120,
      render: (_: unknown, asset: LibraryAsset) => formatSize(asset.size)
    },
    {
      title: t('ui.category'),
      key: 'category',
      width: 140,
      render: (_: unknown, asset: LibraryAsset) => <Tag>{asset.categoryLabel}</Tag>
    },
    {
      title: t('ui.createdAt'),
      key: 'createdAt',
      width: 180,
      render: (_: unknown, asset: LibraryAsset) => formatDate(asset.createdAt)
    },
    {
      title: t('ui.actions2'),
      key: 'actions',
      width: 76,
      fixed: 'right' as const,
      render: (_: unknown, asset: LibraryAsset) => (
        <Tooltip
          title={
            asset.deletable
              ? t('ui.deleteAsset')
              : localizeErrorMessage(
                  asset.deleteBlockedReason || t('ui.thisAssetCannotBeDeleted'),
                  'LIBRARY_ASSET_IN_USE'
                )
          }
        >
          <Button
            danger
            type="text"
            shape="circle"
            aria-label={t('ui.delete')}
            icon={<DeleteOutlined />}
            disabled={!asset.deletable}
            loading={deletingId === asset.id}
            onClick={() => confirmDelete(asset)}
          />
        </Tooltip>
      )
    }
  ]

  return (
    <div className="library-layout">
      <ManagementSidebar
        isMobile={isMobile}
        isOpen={isSidebarOpen}
        activeItem="library-assets"
        summaryTitle={t('ui.library')}
        summaryText={t('counts.assets', { count: assets.length })}
        icon={<InboxOutlined />}
        stats={sidebarStats}
        onClose={() => setSidebarOpen(false)}
        onBack={returnToChat}
      />

      <main className="library-layout-main">
        <div className="library-layout-main-inner">
          <header className="library-layout-header management-page-header">
            <div className="library-layout-header-main management-page-header-main">
              {isMobile ? (
                <ManagementSidebarToggle
                  label={t('ui.openSidebar')}
                  onClick={() => setSidebarOpen(true)}
                />
              ) : null}
              <h2>{t('ui.library')}</h2>
            </div>
          </header>

          <section className="library-layout-toolbar">
            <Segmented<CategoryFilter>
              block={isMobile}
              options={categoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
            <span className="library-layout-count">
              {t('counts.items', { count: filteredAssets.length })}
            </span>
          </section>

          <section className="library-layout-content">
            <Spin spinning={isLoading}>
              {!isLoading && assets.length === 0 ? (
                <div className="library-layout-state">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.noAssetsYet')} />
                </div>
              ) : !isLoading && filteredAssets.length === 0 ? (
                <div className="library-layout-state">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('ui.noResultsForThisFilter')}
                  >
                    <Button onClick={() => setCategoryFilter('all')}>{t('ui.viewAll')}</Button>
                  </Empty>
                </div>
              ) : isMobile ? (
                <div className="library-mobile-list">
                  {filteredAssets.map((asset) => (
                    <article key={asset.id} className="library-mobile-item">
                      <span className={`library-file-icon library-file-icon--${asset.category}`}>
                        {categoryIcon(asset.category)}
                      </span>
                      <div className="library-mobile-text">
                        <span className="library-mobile-kicker">
                          {asset.categoryLabel} · {formatSize(asset.size)}
                        </span>
                        <Button
                          type="link"
                          loading={previewLoadingId === asset.id}
                          onClick={() => void openAsset(asset)}
                        >
                          {asset.fileName}
                        </Button>
                        {renderConversationReferences(asset)}
                        <time dateTime={asset.createdAt}>{formatDate(asset.createdAt)}</time>
                      </div>
                      <Tooltip
                        title={
                          asset.deletable
                            ? t('ui.deleteAsset')
                            : localizeErrorMessage(
                                asset.deleteBlockedReason || t('ui.thisAssetCannotBeDeleted'),
                                'LIBRARY_ASSET_IN_USE'
                              )
                        }
                      >
                        <Button
                          danger
                          shape="circle"
                          aria-label={t('ui.delete')}
                          icon={<DeleteOutlined />}
                          disabled={!asset.deletable}
                          loading={deletingId === asset.id}
                          onClick={() => confirmDelete(asset)}
                        />
                      </Tooltip>
                    </article>
                  ))}
                </div>
              ) : (
                <Table<LibraryAsset>
                  className="library-table"
                  rowKey="id"
                  columns={columns}
                  dataSource={filteredAssets}
                  pagination={false}
                  scroll={{ x: 960 }}
                />
              )}
            </Spin>
          </section>
        </div>
      </main>

      {previewImageUrl ? (
        <Image
          className="library-hidden-preview"
          src={previewImageUrl}
          preview={{
            visible: true,
            src: previewImageUrl,
            onVisibleChange: (visible) => {
              if (!visible) setPreviewImageUrl('')
            }
          }}
        />
      ) : null}
    </div>
  )
}
