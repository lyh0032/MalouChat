import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
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
  useTranslation()
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
      title: t('ui.deleteConversation'),
      content: t('ui.deleteThisConversation'),
      okText: t('ui.delete'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      onOk: () => onDelete(conversation.id)
    })
  }

  const menuItems: MenuProps['items'] = [
    { key: 'pin', label: conversation.isPinned ? t('ui.unpin') : t('ui.pin') },
    { key: 'rename', label: t('ui.rename') },
    ...(conversation.projectId
      ? [{ key: 'remove-project', label: t('ui.removeFromProject') }]
      : []),
    ...(availableProjects.length ? [{ key: 'move', label: t('ui.moveToProject') }] : []),
    { type: 'divider' },
    { key: 'delete', label: t('ui.delete'), danger: true }
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
          aria-label={t('ui.moreConversationActions')}
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
            aria-label={t('ui.moreConversationActions')}
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
          {conversation.isPinned ? t('ui.unpin') : t('ui.pin')}
        </MobileActionSheetItem>
        <MobileActionSheetItem icon={<EditOutlined />} onClick={startRename}>
          {t('ui.rename')}
        </MobileActionSheetItem>
        {conversation.projectId ? (
          <MobileActionSheetItem
            icon={<FolderOpenOutlined />}
            onClick={() => {
              closeActions()
              onMove(conversation.id, null)
            }}
          >
            {t('ui.removeFromProject')}
          </MobileActionSheetItem>
        ) : null}
        {availableProjects.length ? (
          <MobileActionSheetItem icon={<FolderAddOutlined />} onClick={startMove}>
            {t('ui.moveToProject')}
          </MobileActionSheetItem>
        ) : null}
        <MobileActionSheetItem danger icon={<DeleteOutlined />} onClick={confirmDelete}>
          {t('ui.delete')}
        </MobileActionSheetItem>
      </MobileActionSheet>

      <Modal
        closable={{ 'aria-label': t('ui.close') }}
        open={renameOpen}
        title={t('ui.renameConversation')}
        width={380}
        centered
        okText={t('ui.confirm')}
        cancelText={t('ui.cancel')}
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
          placeholder={t('ui.enterAConversationName')}
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
        closable={{ 'aria-label': t('ui.close') }}
        open={moveOpen}
        title={t('ui.moveToProject')}
        width={380}
        centered
        okText={t('ui.confirm')}
        cancelText={t('ui.cancel')}
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
