import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import './ChatLoadingSkeletons.css'

function WelcomeSkeleton() {
  return (
    <div className="chat-loading-welcome">
      <span className="chat-loading-welcome-title chat-loading-shimmer" />
      <span className="chat-loading-welcome-copy chat-loading-shimmer" />
      <span className="chat-loading-suggestion chat-loading-shimmer" />
      <span className="chat-loading-suggestion chat-loading-shimmer" />
      <span className="chat-loading-suggestion chat-loading-shimmer" />
    </div>
  )
}

function ComposerSkeleton() {
  return (
    <div className="chat-loading-composer">
      <span className="chat-loading-composer-line chat-loading-shimmer" />
      <div className="chat-loading-composer-actions">
        <span className="chat-loading-circle chat-loading-shimmer" />
        <span className="chat-loading-circle chat-loading-shimmer" />
        <span className="chat-loading-pill chat-loading-shimmer" />
        <span className="chat-loading-send chat-loading-shimmer" />
      </div>
    </div>
  )
}

export function ChatStartupSkeleton() {
  useTranslation()
  return (
    <div className="chat-startup-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="chat-loading-label">{t('ui.loadingConversation')}</span>
      <aside className="chat-startup-skeleton-sidebar" aria-hidden="true">
        <div className="chat-startup-skeleton-brand">
          <span className="chat-startup-skeleton-mark chat-loading-shimmer" />
          <span className="chat-startup-skeleton-name chat-loading-shimmer" />
        </div>
        <span className="chat-startup-skeleton-nav is-active chat-loading-shimmer" />
        <span className="chat-startup-skeleton-nav chat-loading-shimmer" />
        <span className="chat-startup-skeleton-nav chat-loading-shimmer" />
        <span className="chat-startup-skeleton-nav chat-loading-shimmer" />
        <span className="chat-startup-skeleton-section chat-loading-shimmer" />
        <span className="chat-startup-skeleton-item chat-loading-shimmer" />
        <span className="chat-startup-skeleton-item chat-loading-shimmer" />
        <span className="chat-startup-skeleton-section chat-loading-shimmer" />
        <span className="chat-startup-skeleton-item chat-loading-shimmer" />
        <span className="chat-startup-skeleton-item chat-loading-shimmer" />
      </aside>
      <main className="chat-startup-skeleton-main" aria-hidden="true">
        <header className="chat-startup-skeleton-header">
          <span className="chat-startup-skeleton-trigger chat-loading-shimmer" />
          <span className="chat-startup-skeleton-header-action chat-loading-shimmer" />
        </header>
        <section className="chat-startup-skeleton-content">
          <WelcomeSkeleton />
          <ComposerSkeleton />
        </section>
      </main>
    </div>
  )
}

export function ChatDraftSkeleton() {
  useTranslation()
  return (
    <section className="chat-draft-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="chat-loading-label">{t('ui.restoringYourDraft')}</span>
      <WelcomeSkeleton />
      <ComposerSkeleton />
    </section>
  )
}
