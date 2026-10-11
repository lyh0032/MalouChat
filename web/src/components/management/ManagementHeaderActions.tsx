import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import './ManagementHeaderActions.css'

type ManagementHeaderActionsProps = {
  onCreate: () => void
}

export default function ManagementHeaderActions({ onCreate }: ManagementHeaderActionsProps) {
  return (
    <div className="management-header-actions">
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新建
      </Button>
    </div>
  )
}
