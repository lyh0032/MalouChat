import { BulbOutlined, DesktopOutlined, MoonOutlined } from '@ant-design/icons'

import { useThemeStore, type ThemeMode } from '../stores/theme'
import LiquidGlassSwitch from './LiquidGlassSwitch'

import './AuthThemeToggle.css'

const themeOptions = [
  { value: 'system', label: '系统', icon: DesktopOutlined },
  { value: 'light', label: '浅色', icon: BulbOutlined },
  { value: 'dark', label: '深色', icon: MoonOutlined }
] satisfies Array<{ value: ThemeMode; label: string; icon: typeof DesktopOutlined }>

export default function AuthThemeToggle() {
  const mode = useThemeStore((state) => state.mode)
  const setMode = useThemeStore((state) => state.setMode)

  return (
    <LiquidGlassSwitch
      className="auth-theme-toggle"
      value={mode}
      options={themeOptions}
      onChange={setMode}
      ariaLabel="显示模式"
      size="sm"
      hideLabelsOnMobile
    />
  )
}
