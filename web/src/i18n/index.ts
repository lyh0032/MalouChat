import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import sourceKeys from './source-keys.json'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export type UiLanguage = 'zh-CN' | 'en-US'
const STORAGE_KEY = 'malou-ui-language'
export function normalizeLanguage(value: unknown): UiLanguage {
  return value === 'en-US' ? 'en-US' : 'zh-CN'
}
function storedLanguage(): UiLanguage {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'zh-CN'
  }
}
void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS }
  },
  lng: storedLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en-US'],
  load: 'currentOnly',
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
})
function applyLanguage(language: string) {
  const resolved = normalizeLanguage(language)
  document.documentElement.lang = resolved
  try {
    localStorage.setItem(STORAGE_KEY, resolved)
  } catch {
    /* Storage may be unavailable. */
  }
}
i18n.on('languageChanged', applyLanguage)
applyLanguage(i18n.language)
export function setUiLanguage(language: UiLanguage) {
  void i18n.changeLanguage(language)
}
export function getUiLanguage(): UiLanguage {
  return normalizeLanguage(i18n.language)
}
export const t = (key: string, values?: Record<string, unknown>): string =>
  i18n.t(key, values ?? {}) as string
export default i18n

// Status text can already be English when the user switches back to Chinese.
// Resolve both catalogue variants so stored UI statuses remain reactive.
const sourceToKey = new Map<string, string>(Object.entries(sourceKeys))
for (const key of Object.values(sourceKeys)) {
  const english = i18n.getResource('en-US', 'translation', key)
  if (typeof english === 'string' && !sourceToKey.has(english)) sourceToKey.set(english, key)
}

export function translateSource(source: string): string {
  const key = sourceToKey.get(source)
  return key ? t(key) : source
}
