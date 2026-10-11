import { useEffect, useState } from 'react'
import { Empty, Input, Modal, Radio, Segmented, Spin } from 'antd'
import {
  FileImageOutlined,
  FileOutlined,
  PictureOutlined,
  SearchOutlined
} from '@ant-design/icons'

import { fetchSelectableLibraryAssets } from '../../api/library-asset'
import type { LibraryAsset, LibraryAssetCategory } from '../../types/library-asset'

import './LibraryAssetPickerDialog.css'

type PickerCategory = 'all' | Exclude<LibraryAssetCategory, 'knowledge_base_attachment'>

type Props = {
  open: boolean
  submitting: boolean
  onCancel: () => void
  onConfirm: (asset: LibraryAsset) => void
}

const categoryOptions: Array<{ label: string; value: PickerCategory }> = [
  { label: '全部', value: 'all' },
  { label: '文件', value: 'user_file' },
  { label: '图片', value: 'user_image' },
  { label: '文生图', value: 'generated_image' }
]

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function assetIcon(category: LibraryAssetCategory) {
  if (category === 'generated_image') return <PictureOutlined />
  if (category === 'user_image') return <FileImageOutlined />
  return <FileOutlined />
}

export default function LibraryAssetPickerDialog({
  open,
  submitting,
  onCancel,
  onConfirm
}: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PickerCategory>('all')
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      void fetchSelectableLibraryAssets({ query, category })
        .then((items) => {
          if (!controller.signal.aborted) setAssets(items)
        })
        .catch(() => {
          if (!controller.signal.aborted) setAssets([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [category, open, query])

  useEffect(() => {
    if (open) return
    setQuery('')
    setCategory('all')
    setSelectedId('')
    setAssets([])
  }, [open])

  const selectedAsset = assets.find((asset) => asset.id === selectedId)

  return (
    <Modal
      className="library-asset-picker"
      open={open}
      title="从资料库添加"
      okText="添加"
      cancelText="取消"
      okButtonProps={{ disabled: !selectedAsset, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      onCancel={onCancel}
      onOk={() => {
        if (selectedAsset) onConfirm(selectedAsset)
      }}
    >
      <div className="library-asset-picker-controls">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索文件名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Segmented<PickerCategory>
          block
          options={categoryOptions}
          value={category}
          onChange={setCategory}
        />
      </div>

      <Spin spinning={loading}>
        <div className="library-asset-picker-list">
          {!loading && assets.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可添加的资料" />
          ) : (
            <div className="library-asset-picker-items" role="radiogroup" aria-label="可选资料">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={`library-asset-picker-item${asset.id === selectedId ? ' is-selected' : ''}`}
                  role="radio"
                  aria-checked={asset.id === selectedId}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span className={`library-asset-picker-icon is-${asset.category}`}>
                    {assetIcon(asset.category)}
                  </span>
                  <div className="library-asset-picker-copy">
                    <strong>{asset.fileName}</strong>
                    <span>
                      {asset.categoryLabel} · {formatSize(asset.size)}
                    </span>
                  </div>
                  <Radio checked={asset.id === selectedId} tabIndex={-1} />
                </button>
              ))}
            </div>
          )}
        </div>
      </Spin>
    </Modal>
  )
}
