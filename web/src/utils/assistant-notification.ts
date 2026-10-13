import { t } from '../i18n'
import type { Message } from '../types/chat'
import { markdownToPlainText } from './markdown'

const NOTIFICATION_BODY_MAX_LENGTH = 180
const NOTIFICATION_SERVICE_WORKER_PATH = '/notification-sw.js'
const NOTIFICATION_LOG_PREFIX = '[assistant-notification]'
const SERVICE_WORKER_READY_TIMEOUT_MS = 5_000

let permissionRequestedThisPage = false

type AssistantNotificationContent = {
  title: string
  body: string
}

function supportsNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

function logNotification(event: string, details?: Record<string, unknown>) {
  console.log(NOTIFICATION_LOG_PREFIX, event, details ?? {})
}

function waitForNotificationServiceWorker() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Service worker activation timed out'))
      }, SERVICE_WORKER_READY_TIMEOUT_MS)
    })
  ])
}

function truncateNotificationBody(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  const characters = Array.from(normalized)

  if (characters.length <= NOTIFICATION_BODY_MAX_LENGTH) {
    return normalized
  }

  return `${characters.slice(0, NOTIFICATION_BODY_MAX_LENGTH).join('')}...`
}

export function buildAssistantNotificationContent(
  message: Pick<Message, 'content' | 'type'>
): AssistantNotificationContent {
  if (message.type === 'image') {
    return {
      title: 'MalouChat',
      body: t('ui.yourImageIsReadyClickToViewIt')
    }
  }

  const answerText = truncateNotificationBody(markdownToPlainText(message.content))
  return {
    title: t('ui.malouHasFinishedResponding'),
    body: answerText || t('ui.yourResponseIsReadyClickToViewIt')
  }
}

async function getNotificationServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    logNotification('service-worker-unavailable')
    return null
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration('/')
    if (existingRegistration) {
      if (existingRegistration.active) {
        logNotification('service-worker-active', {
          source: 'existing',
          scriptUrl: existingRegistration.active.scriptURL
        })
        return existingRegistration
      }

      logNotification('service-worker-waiting-for-activation', {
        source: 'existing'
      })
      const readyRegistration = await waitForNotificationServiceWorker()
      logNotification('service-worker-active', {
        source: 'ready',
        scriptUrl: readyRegistration.active?.scriptURL
      })
      return readyRegistration
    }

    logNotification('service-worker-registering', {
      scriptPath: NOTIFICATION_SERVICE_WORKER_PATH
    })
    const registration = await navigator.serviceWorker.register(NOTIFICATION_SERVICE_WORKER_PATH, {
      scope: '/'
    })

    if (registration.active) {
      logNotification('service-worker-active', {
        source: 'registered',
        scriptUrl: registration.active.scriptURL
      })
      return registration
    }

    logNotification('service-worker-waiting-for-activation', {
      source: 'registered'
    })
    const readyRegistration = await waitForNotificationServiceWorker()
    logNotification('service-worker-active', {
      source: 'ready',
      scriptUrl: readyRegistration.active?.scriptURL
    })
    return readyRegistration
  } catch (error) {
    console.warn(NOTIFICATION_LOG_PREFIX, 'service-worker-failed', error)
    return null
  }
}

export function requestAssistantNotificationPermission() {
  const supported = supportsNotifications()
  const permission = supported ? Notification.permission : 'unsupported'

  logNotification('permission-check', {
    supported,
    secureContext: window.isSecureContext,
    permission,
    permissionRequestedThisPage,
    serviceWorkerSupported: 'serviceWorker' in navigator
  })

  if (!supported) {
    logNotification('permission-skipped', { reason: 'notification-api-unsupported' })
    return
  }

  if (Notification.permission === 'denied') {
    logNotification('permission-skipped', { reason: 'permission-denied' })
    return
  }

  if (Notification.permission === 'granted') {
    logNotification('permission-ready', { permission: 'granted' })
    void getNotificationServiceWorker()
    return
  }

  if (permissionRequestedThisPage) {
    logNotification('permission-skipped', {
      reason: 'already-requested-this-page-and-still-default'
    })
    return
  }

  permissionRequestedThisPage = true
  logNotification('permission-request-started')
  void Notification.requestPermission()
    .then((permission) => {
      logNotification('permission-request-finished', { permission })
      if (permission === 'granted') {
        void getNotificationServiceWorker()
      }
    })
    .catch((error) => {
      console.warn(NOTIFICATION_LOG_PREFIX, 'permission-request-failed', error)
    })
}

export async function notifyAssistantCompletion(message: Message) {
  const supported = supportsNotifications()
  const permission = supported ? Notification.permission : 'unsupported'

  logNotification('completion-received', {
    messageId: message.id,
    conversationId: message.conversationId,
    messageType: message.type ?? 'text',
    messageStatus: message.status,
    supported,
    permission,
    pageVisibility: document.visibilityState,
    windowFocused: document.hasFocus()
  })

  if (!supported) {
    logNotification('notification-skipped', { reason: 'notification-api-unsupported' })
    return
  }

  if (Notification.permission !== 'granted') {
    logNotification('notification-skipped', {
      reason: 'permission-not-granted',
      permission: Notification.permission
    })
    return
  }

  const { title, body } = buildAssistantNotificationContent(message)
  const targetUrl = window.location.href
  const options: NotificationOptions = {
    body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: `malou-assistant-${message.id}`,
    data: { url: targetUrl }
  }

  const serviceWorkerRegistration = await getNotificationServiceWorker()
  if (serviceWorkerRegistration) {
    try {
      await serviceWorkerRegistration.showNotification(title, options)
      logNotification('notification-shown', {
        method: 'service-worker',
        messageId: message.id,
        title,
        body
      })
      return
    } catch (error) {
      console.warn(NOTIFICATION_LOG_PREFIX, 'service-worker-show-failed', error)
    }
  }

  try {
    const notification = new Notification(title, options)
    logNotification('notification-shown', {
      method: 'notification-constructor',
      messageId: message.id,
      title,
      body
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch (error) {
    console.warn(NOTIFICATION_LOG_PREFIX, 'notification-constructor-failed', error)
  }
}
