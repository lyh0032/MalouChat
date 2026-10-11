import { LeftOutlined, MenuOutlined } from '@ant-design/icons'

import './ManagementSidebarToggle.css'

type ManagementSidebarToggleProps = {
  close?: boolean
  label: string
  onClick: () => void
}

export default function ManagementSidebarToggle({
  close = false,
  label,
  onClick
}: ManagementSidebarToggleProps) {
  return (
    <button
      className={`management-sidebar-toggle${close ? ' management-sidebar-toggle--close' : ''}`}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {close ? <LeftOutlined /> : <MenuOutlined />}
    </button>
  )
}
