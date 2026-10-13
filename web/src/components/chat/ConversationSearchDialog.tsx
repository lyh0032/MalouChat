import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { useMemo, useState } from 'react'
import { Empty, Input, Modal } from 'antd'
import type { ConversationSummary } from '../../types/chat'
import './ConversationSearchDialog.css'

export default function ConversationSearchDialog({
  open,
  conversations,
  onClose,
  onSelect
}: {
  open: boolean
  conversations: ConversationSummary[]
  onClose: () => void
  onSelect: (id: string) => void
}) {
  useTranslation()
  const [keyword, setKeyword] = useState('')
  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query
      ? conversations.filter((item) =>
          `${item.title} ${item.lastMessagePreview}`.toLowerCase().includes(query)
        )
      : conversations
  }, [conversations, keyword])
  return (
    <Modal
      closable={{ 'aria-label': t('ui.close') }}
      open={open}
      title={t('ui.searchChats')}
      width={540}
      centered
      footer={null}
      onCancel={() => {
        setKeyword('')
        onClose()
      }}
    >
      <div className="conversation-search">
        <Input.Search
          autoFocus
          allowClear
          value={keyword}
          placeholder={t('ui.searchTitlesOrMessages')}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className="conversation-search-results">
          {results.length ? (
            results.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
                <strong>{item.title}</strong>
                <span>{item.lastMessagePreview || t('ui.noMessagesYet')}</span>
              </button>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('ui.noMatchingConversations')}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}
