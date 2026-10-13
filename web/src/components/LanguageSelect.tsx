import { Select } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { normalizeLanguage, type UiLanguage } from '../i18n'

export default function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const saving = useAuthStore((state) => state.isSavingLanguage)
  const setLanguage = useAuthStore((state) => state.setLanguage)
  return (
    <Select<UiLanguage>
      className={className}
      value={normalizeLanguage(i18n.language)}
      aria-label={t('settings.language')}
      suffixIcon={<GlobalOutlined />}
      disabled={saving}
      loading={saving}
      options={[
        { value: 'zh-CN', label: '简体中文' },
        { value: 'en-US', label: 'English' }
      ]}
      onChange={(value) => void setLanguage(value)}
    />
  )
}
