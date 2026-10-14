import { Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { normalizeLanguage, type UiLanguage } from '../i18n'
import LiquidGlassSwitch from './LiquidGlassSwitch'

export default function LanguageSelect({ className, variant = 'settings' }: {
  className?: string
  variant?: 'settings' | 'auth'
}) {
  const { t, i18n } = useTranslation()
  const saving = useAuthStore((state) => state.isSavingLanguage)
  const setLanguage = useAuthStore((state) => state.setLanguage)
  const options = [
    { value: 'zh-CN', label: '中文', ariaLabel: '简体中文' },
    { value: 'en-US', label: 'English' }
  ] satisfies Array<{ value: UiLanguage; label: string; ariaLabel?: string }>
  if (variant === 'auth') {
    return (
      <LiquidGlassSwitch
        className={className}
        value={normalizeLanguage(i18n.language)}
        options={options}
        ariaLabel={t('settings.language')}
        size="sm"
        disabled={saving}
        onChange={(value) => void setLanguage(value)}
      />
    )
  }
  return (
    <Segmented<UiLanguage>
      className={className}
      value={normalizeLanguage(i18n.language)}
      aria-label={t('settings.language')}
      disabled={saving}
      options={options}
      onChange={(value) => void setLanguage(value)}
    />
  )
}
