import { useTranslation } from 'react-i18next'
import { t } from '../i18n'
import { BulbOutlined, DesktopOutlined, MoonOutlined } from '@ant-design/icons'

import { useThemeStore, type ThemeMode } from '../stores/theme'
import LiquidGlassSwitch from './LiquidGlassSwitch'

import './AuthThemeToggle.css'

export default function AuthThemeToggle() {
  const themeOptions = [
    { value: 'system', label: t('ui.system'), icon: DesktopOutlined },
    { value: 'light', label: t('ui.light'), icon: BulbOutlined },
    { value: 'dark', label: t('ui.dark'), icon: MoonOutlined }
  ] satisfies Array<{ value: ThemeMode; label: string; icon: typeof DesktopOutlined }>

  useTranslation()
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  return (
    <LiquidGlassSwitch
      className="auth-theme-toggle"
      value={mode}
      options={themeOptions}
      onChange={setMode}
      ariaLabel={t('ui.appearance')}
      size="sm"
      hideLabelsOnMobile
    />
  )
}
