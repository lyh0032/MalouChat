import { useMemo, useState } from 'react'
import { App as AntApp, Button, Dropdown, Input, Modal, Select } from 'antd'
import type { MenuProps } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  MoreOutlined
} from '@ant-design/icons'

import type { ConversationSummary } from '../../types/chat'
import type { ProjectRecord } from '../../types/project'
import MobileActionSheet, { MobileActionSheetItem } from '../common/MobileActionSheet'
import IconParkPin from '../icons/IconParkPin'

type Props = {
  conversation: ConversationSummary
  projects: ProjectRecord[]
  mobile: boolean
  onTogglePin: (id: string, pinned: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, projectId: string | null) => void
}

export default function ConversationActions({
  conversation,
  projects,
  mobile,
  onTogglePin,
  onRename,
  onDelete,
  onMove
}: Props) {
  const { modal } = AntApp.useApp()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [targetProjectId, setTargetProjectId] = useState('')
  const availableProjects = useMemo(
    () => projects.filter((project) => project.id !== conversation.projectId),
    [conversation.projectId, projects]
  )

  function closeActions() {
    setSheetOpen(false)
  }
  function togglePin() {
    closeActions()
    onTogglePin(conversation.id, !conversation.isPinned)
  }
  function startRename() {
    closeActions()
    setRenameTitle(conversation.title)
    setRenameOpen(true)
  }
  function startMove() {
    closeActions()
    setTargetProjectId(availableProjects[0]?.id ?? '')
    setMoveOpen(true)
  }
  function confirmDelete() {
    closeActions()
    modal.confirm({
      title: '删除会话',
      content: '确定要删除这个会话吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => onDelete(conversation.id)
    })
  }

  const menuItems: MenuProps['items'] = [
    { key: 'pin', label: conversation.isPinned ? '取消置顶' : '置顶' },
    { key: 'rename', label: '重命名' },
    ...(conversation.projectId ? [{ key: 'remove-project', label: '移出项目' }] : []),
    ...(availableProjects.length ? [{ key: 'move', label: '加入项目' }] : []),
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true }
  ]

  function action(key: string) {
    if (key === 'pin') togglePin()
    if (key === 'rename') startRename()
    if (key === 'remove-project') onMove(conversation.id, null)
    if (key === 'move') startMove()
    if (key === 'delete') confirmDelete()
  }

  return (
    <>
      {mobile ? (
        <Button
          className="conversation-more-button"
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label="更多会话操作"
          onClick={(event) => {
            event.stopPropagation()
            setSheetOpen(true)
          }}
        />
      ) : (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: menuItems,
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation()
              action(key)
            }
          }}
        >
          <Button
            className="conversation-more-button"
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label="更多会话操作"
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      )}

      <MobileActionSheet
        open={sheetOpen}
        title={conversation.title}
        onClose={() => setSheetOpen(false)}
      >
        <MobileActionSheetItem icon={<IconParkPin />} onClick={togglePin}>
          {conversation.isPinned ? '取消置顶' : '置顶'}
        </MobileActionSheetItem>
        <MobileActionSheetItem icon={<EditOutlined />} onClick={startRename}>
          重命名
        </MobileActionSheetItem>
        {conversation.projectId ? (
          <MobileActionSheetItem
            icon={<FolderOpenOutlined />}
            onClick={() => {
              closeActions()
              onMove(conversation.id, null)
            }}
          >
            移出项目
          </MobileActionSheetItem>
        ) : null}
        {availableProjects.length ? (
          <MobileActionSheetItem icon={<FolderAddOutlined />} onClick={startMove}>
            加入项目
          </MobileActionSheetItem>
        ) : null}
        <MobileActionSheetItem danger icon={<DeleteOutlined />} onClick={confirmDelete}>
          删除
        </MobileActionSheetItem>
      </MobileActionSheet>

      <Modal
        open={renameOpen}
        title="重命名会话"
        width={380}
        centered
        okText="确定"
        cancelText="取消"
        okButtonProps={{ disabled: !renameTitle.trim() }}
        onOk={() => {
          onRename(conversation.id, renameTitle.trim())
          setRenameOpen(false)
        }}
        onCancel={() => setRenameOpen(false)}
      >
        <Input
          autoFocus
          value={renameTitle}
          maxLength={80}
          placeholder="请输入会话名称"
          onChange={(event) => setRenameTitle(event.target.value)}
          onPressEnter={() => {
            if (renameTitle.trim()) {
              onRename(conversation.id, renameTitle.trim())
              setRenameOpen(false)
            }
          }}
        />
      </Modal>
      <Modal
        open={moveOpen}
        title="加入项目"
        width={380}
        centered
        okText="确定"
        cancelText="取消"
        okButtonProps={{ disabled: !targetProjectId }}
        onOk={() => {
          if (targetProjectId) onMove(conversation.id, targetProjectId)
          setMoveOpen(false)
        }}
        onCancel={() => setMoveOpen(false)}
      >
        <Select
          value={targetProjectId}
          options={availableProjects.map((project) => ({
            label: project.title,
            value: project.id
          }))}
          style={{ width: '100%' }}
          onChange={setTargetProjectId}
        />
      </Modal>
    </>
  )
}
