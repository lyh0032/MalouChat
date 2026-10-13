import i18n, { getUiLanguage, t, translateSource } from './index'

/** Localize interface errors without translating AI responses or user content. */
export function localizeErrorMessage(message: string, errorCode?: string): string {
  if (getUiLanguage() === 'zh-CN') return message
  if (errorCode && i18n.exists(`errors.${errorCode}`)) return t(`errors.${errorCode}`)
  const translated = translateSource(message)
  if (translated !== message || !/[\u3400-\u9fff]/u.test(message)) return translated
  return t('ui.requestFailed')
}
