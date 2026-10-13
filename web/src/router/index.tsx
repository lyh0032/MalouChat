import { useTranslation } from 'react-i18next'
import { t } from '../i18n'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Spin } from 'antd'

import { ChatStartupSkeleton } from '../components/chat/ChatLoadingSkeletons'
import { selectIsAuthenticated, useAuthStore } from '../stores/auth'
import { rememberChatRoute } from './chat-route-cache'
const LoginView = lazy(() => import('../views/LoginView'))
const LibraryAssetView = lazy(() => import('../views/LibraryAssetView'))
const KnowledgeBaseView = lazy(() => import('../views/KnowledgeBaseView'))
const MemoryView = lazy(() => import('../views/MemoryView'))
const AdminView = lazy(() => import('../views/AdminView'))
const ChatView = lazy(() => import('../views/ChatView'))
const ArchitectureView = lazy(() => import('../views/ArchitectureView'))

function RouteLoading() {
  useTranslation()
  const location = useLocation()
  if (
    location.pathname === '/' ||
    location.pathname === '/chat' ||
    location.pathname.startsWith('/chat/')
  )
    return <ChatStartupSkeleton />
  return (
    <div className="app-route-loading" aria-label={t('ui.loadingPage')}>
      <Spin size="large" />
    </div>
  )
}

function AuthGate({ publicOnly = false }: { publicOnly?: boolean }) {
  const restoreSession = useAuthStore((state) => state.restoreSession)
  const hasRestored = useAuthStore((state) => state.hasRestored)
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  if (!hasRestored) return <RouteLoading />
  if (publicOnly && isAuthenticated) return <Navigate to="/chat" replace />
  if (!publicOnly && !isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

function AdminGate() {
  const isAdmin = useAuthStore((state) => Boolean(state.user?.isAdmin))
  return isAdmin ? <Outlet /> : <Navigate to="/chat" replace />
}

function RouteTracker() {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/chat' || location.pathname.startsWith('/chat/')) {
      rememberChatRoute(`${location.pathname}${location.search}`)
    }
  }, [location.pathname, location.search])

  return null
}

function AuthenticatedShell() {
  const location = useLocation()
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
  const [hasOpenedChat, setHasOpenedChat] = useState(isChatRoute)

  useEffect(() => {
    if (isChatRoute) setHasOpenedChat(true)
  }, [isChatRoute])

  return (
    <>
      {hasOpenedChat ? (
        <div style={{ display: isChatRoute ? 'contents' : 'none' }} aria-hidden={!isChatRoute}>
          <ChatView active={isChatRoute} />
        </div>
      ) : null}
      {!isChatRoute ? <Outlet /> : null}
    </>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />

          <Route element={<AuthGate publicOnly />}>
            <Route path="/login" element={<LoginView />} />
            <Route path="/register" element={<LoginView />} />
          </Route>

          <Route path="/architecture" element={<ArchitectureView />} />

          <Route element={<AuthGate />}>
            <Route element={<AuthenticatedShell />}>
              <Route path="/chat" element={null} />
              <Route path="/chat/:projectId" element={null} />
              <Route path="/chat/:projectId/:conversationId" element={null} />
              <Route path="/memories" element={<MemoryView />} />
              <Route path="/knowledge-bases" element={<KnowledgeBaseView />} />
              <Route path="/library-assets" element={<LibraryAssetView />} />
              <Route element={<AdminGate />}>
                <Route path="/admin" element={<AdminView />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
