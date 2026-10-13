import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import './ManagementHeaderActions.css'

type ManagementHeaderActionsProps = {
  onCreate: () => void
}

export default function ManagementHeaderActions({ onCreate }: ManagementHeaderActionsProps) {
  useTranslation()
  return (
    <div className="management-header-actions">
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        {t('ui.new')}
      </Button>
    </div>
  )
}
