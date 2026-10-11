import type { ReactNode } from 'react'
import { Button } from 'antd'
import {
  BookOutlined,
  CloseOutlined,
  DatabaseOutlined,
  FolderOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined
} from '@ant-design/icons'

import MalouBrand from '../MalouBrand'

import './AppSidebarShell.css'

export type AppSidebarActiveItem =
  | 'new-conversation'
  | 'memories'
  | 'library-assets'
  | 'knowledge-bases'
  | 'admin'
  | null

type AppSidebarShellProps = {
  mobile: boolean
  open: boolean
  activeItem?: AppSidebarActiveItem
  knowledgeBaseCount: number
  isAdmin: boolean
  userInitial: string
  userDisplayName: string
  children: ReactNode
  onClose: () => void
  onBrandClick?: () => void
  onCreateConversation: () => void
  onSearch: () => void
  onNavigate: (path: string) => void
  onSettings: () => void
}

export default function AppSidebarShell({
  mobile,
  open,
  activeItem = null,
  knowledgeBaseCount,
  isAdmin,
  userInitial,
  userDisplayName,
  children,
  onClose,
  onBrandClick,
  onCreateConversation,
  onSearch,
  onNavigate,
  onSettings
}: AppSidebarShellProps) {
  function itemClass(item: AppSidebarActiveItem) {
    return activeItem === item ? 'is-active' : undefined
  }

  return (
    <>
      {mobile && open ? (
        <button
          className="app-sidebar-backdrop"
          type="button"
          aria-label="关闭侧边菜单"
          onClick={onClose}
        />
      ) : null}

      <aside className={`chat-sidebar${open ? ' chat-sidebar--open' : ''}`}>
        <header className="chat-sidebar-brand">
          {onBrandClick ? (
            <button
              className="app-sidebar-brand-link"
              type="button"
              aria-label="返回 MalouChat"
              onClick={onBrandClick}
            >
              <MalouBrand className="layout-brand-logo" />
            </button>
          ) : (
            <MalouBrand className="layout-brand-logo" />
          )}
          {mobile ? (
            <Button
              shape="circle"
              icon={<CloseOutlined />}
              aria-label="关闭菜单"
              onClick={onClose}
            />
          ) : null}
        </header>

        <nav className="chat-sidebar-top" aria-label="主导航">
          <button
            className={itemClass('new-conversation')}
            type="button"
            aria-current={activeItem === 'new-conversation' ? 'page' : undefined}
            onClick={onCreateConversation}
          >
            <PlusOutlined />
            <span>新建对话</span>
          </button>
          <button type="button" onClick={onSearch}>
            <SearchOutlined />
            <span>搜索对话</span>
          </button>
          <button
            className={itemClass('memories')}
            type="button"
            aria-current={activeItem === 'memories' ? 'page' : undefined}
            onClick={() => onNavigate('/memories')}
          >
            <BookOutlined />
            <span>管理记忆</span>
          </button>
          <button
            className={itemClass('library-assets')}
            type="button"
            aria-current={activeItem === 'library-assets' ? 'page' : undefined}
            onClick={() => onNavigate('/library-assets')}
          >
            <FolderOutlined />
            <span>资料库</span>
          </button>
          <button
            className={itemClass('knowledge-bases')}
            type="button"
            aria-current={activeItem === 'knowledge-bases' ? 'page' : undefined}
            onClick={() => onNavigate('/knowledge-bases')}
          >
            <DatabaseOutlined />
            <span>知识库</span>
            {knowledgeBaseCount > 0 ? <b>{knowledgeBaseCount}</b> : null}
          </button>
          {isAdmin ? (
            <button
              className={itemClass('admin')}
              type="button"
              aria-current={activeItem === 'admin' ? 'page' : undefined}
              onClick={() => onNavigate('/admin')}
            >
              <ToolOutlined />
              <span>后台管理</span>
            </button>
          ) : null}
        </nav>

        <div className="chat-sidebar-scroll">{children}</div>

        <footer className="chat-sidebar-user">
          <span className="chat-sidebar-avatar">{userInitial}</span>
          <strong>{userDisplayName}</strong>
          <Button
            type="text"
            shape="circle"
            icon={<SettingOutlined />}
            aria-label="设置"
            onClick={onSettings}
          />
        </footer>
      </aside>
    </>
  )
}
