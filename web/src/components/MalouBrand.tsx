import type { CSSProperties } from 'react'

import './MalouBrand.css'

type MalouBrandProps = {
  name?: string
  className?: string
  compact?: boolean
}

export default function MalouBrand({
  name = 'MalouChat',
  className = '',
  compact = false
}: MalouBrandProps) {
  return (
    <div
      className={`malou-brand${compact ? ' malou-brand--compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={name}
    >
      <img
        className="malou-brand-mark"
        src="/logo.svg"
        width="40"
        height="40"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="malou-brand-name">{name}</span>
    </div>
  )
}

export type MalouBrandStyle = CSSProperties
