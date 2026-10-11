import { useEffect, type ReactNode } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'

import './MobileActionSheet.css'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}

export default function MobileActionSheet({ open, title, children, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null
  return createPortal(
    <div
      className="mobile-action-sheet-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="mobile-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="操作菜单"
      >
        <header>
          <h3>{title}</h3>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <CloseOutlined />
          </button>
        </header>
        <div className="mobile-action-sheet-content">{children}</div>
      </section>
    </div>,
    document.body
  )
}

export function MobileActionSheetItem({
  icon,
  danger = false,
  children,
  onClick
}: {
  icon: ReactNode
  danger?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={`mobile-action-sheet-item${danger ? ' mobile-action-sheet-item--danger' : ''}`}
      type="button"
      onClick={onClick}
    >
      <span>{icon}</span>
      <strong>{children}</strong>
    </button>
  )
}
