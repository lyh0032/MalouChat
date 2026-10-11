import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, ConfigProvider, Modal, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'

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
        void message.success('已加入团队知识库')
      } else {
        await rejectKnowledgeBaseInvitation(id)
        void message.success('已拒绝邀请')
      }
      setInvitations((records) => records.filter((record) => record.id !== id))
    } finally {
      setHandlingId('')
    }
  }

  return (
    <Modal
      open={Boolean(userId && invitations.length)}
      title="知识库邀请"
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
                <span>{item.inviter.username} 邀请你加入团队知识库</span>
              </div>
              <div className="app-kb-invitation-actions">
                <Button
                  loading={handlingId === item.id}
                  onClick={() => void handleInvitation(item.id, 'reject')}
                >
                  拒绝
                </Button>
                <Button
                  type="primary"
                  loading={handlingId === item.id}
                  onClick={() => void handleInvitation(item.id, 'accept')}
                >
                  同意
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
  const resolvedMode = useThemeStore((state) => state.resolvedMode)
  const isDark = resolvedMode === 'dark'

  return (
    <ConfigProvider
      locale={zhCN}
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
