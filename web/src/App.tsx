import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, ConfigProvider, Modal, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'

import AppRouter from './router/index'
import {
  acceptKnowledgeBaseInvitation,
  fetchKnowledgeBaseInvitations,
  rejectKnowledgeBaseInvitation
} from './api/knowledge-base'
import { useAuthStore } from './stores/auth'
import { useKnowledgeBaseStore } from './stores/knowledge-base'
import { useThemeStore } from './stores/theme'
import type { KnowledgeBaseInvitation } from './types/knowledge-base'
import { setToastHandler } from './utils/toast'

function ToastBridge() {
  const { message } = AntApp.useApp()

  useEffect(() => {
    setToastHandler({
      error: (content) => {
        void message.error(content)
      },
      success: (content) => {
        void message.success(content)
      },
      info: (content) => {
        void message.info(content)
      },
      warning: (content) => {
        void message.warning(content)
      }
    })

    return () => setToastHandler(null)
  }, [message])

  return null
}

function KnowledgeBaseInvitationManager() {
  useTranslation()
  const { message } = AntApp.useApp()
  const userId = useAuthStore((state) => state.user?.id ?? '')
  const loadKnowledgeBases = useKnowledgeBaseStore((state) => state.loadKnowledgeBases)
  const [invitations, setInvitations] = useState<KnowledgeBaseInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [handlingId, setHandlingId] = useState('')
  const requestSequence = useRef(0)

  useEffect(() => {
    const sequence = ++requestSequence.current
    if (!userId) {
      setInvitations([])
      setLoading(false)
      return
    }
    setLoading(true)
    void fetchKnowledgeBaseInvitations()
      .then((records) => {
        if (sequence === requestSequence.current) setInvitations(records)
      })
      .catch((error) => console.error('Failed to load knowledge base invitations:', error))
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false)
      })
  }, [userId])

  async function handleInvitation(id: string, action: 'accept' | 'reject') {
    setHandlingId(id)
    try {
      if (action === 'accept') {
        await acceptKnowledgeBaseInvitation(id)
        await loadKnowledgeBases(true, true)
        void message.success(t('ui.joinedTheTeamKnowledgeBase'))
      } else {
        await rejectKnowledgeBaseInvitation(id)
        void message.success(t('ui.invitationDeclined'))
      }
      setInvitations((records) => records.filter((record) => record.id !== id))
    } finally {
      setHandlingId('')
    }
  }

  return (
    <Modal
      closable={{ 'aria-label': t('ui.close') }}
      open={Boolean(userId && invitations.length)}
      title={t('ui.knowledgeBaseInvitations')}
      width={560}
      centered
      mask={{ closable: false }}
      footer={null}
      onCancel={() => setInvitations([])}
    >
      <Spin spinning={loading}>
        <div className="app-kb-invitations">
          {invitations.map((item) => (
            <article key={item.id} className="app-kb-invitation">
              <div>
                <strong>{item.knowledgeBase.title}</strong>
                <span>
                  {item.inviter.username}
                  {t('ui.invitesYouToJoinATeamKnowledgeBase')}
                </span>
              </div>
              <div className="app-kb-invitation-actions">
                <Button
                  loading={handlingId === item.id}
                  onClick={() => void handleInvitation(item.id, 'reject')}
                >
                  {t('ui.decline')}
                </Button>
                <Button
                  type="primary"
                  loading={handlingId === item.id}
                  onClick={() => void handleInvitation(item.id, 'accept')}
                >
                  {t('ui.accept')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Spin>
    </Modal>
  )
}

export default function App() {
  const { i18n } = useTranslation()
  const resolvedMode = useThemeStore((state) => state.resolvedMode)
  const isDark = resolvedMode === 'dark'

  return (
    <ConfigProvider
      locale={i18n.language === 'en-US' ? enUS : zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#5a8bc9' : '#123458',
          colorInfo: isDark ? '#5a8bc9' : '#123458',
          colorBgBase: isDark ? '#080b18' : '#f0f4f8',
          colorTextBase: isDark ? '#e0e4f0' : '#142235',
          borderRadius: 8,
          fontFamily: "'Manrope', 'PingFang SC', 'Noto Sans SC', sans-serif"
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 36
          },
          Card: {
            borderRadiusLG: 8
          },
          Input: {
            activeBorderColor: isDark ? '#5a8bc9' : '#275d90',
            hoverBorderColor: isDark ? '#5a8bc9' : '#275d90'
          },
          Modal: {
            borderRadiusLG: 8
          }
        }
      }}
    >
      <AntApp>
        <ToastBridge />
        <KnowledgeBaseInvitationManager />
        <AppRouter />
      </AntApp>
    </ConfigProvider>
  )
}
