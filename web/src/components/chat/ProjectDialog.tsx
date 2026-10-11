import { useEffect, useState } from 'react'
import { ColorPicker, Input, Modal } from 'antd'

import type { CreateProjectInput, ProjectRecord } from '../../types/project'
import ProjectIcon, { projectIconOptions } from './ProjectIcon'

import './ProjectDialog.css'

const colors = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#be123c',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#334155',
  '#dc2626',
  '#65a30d'
]

export default function ProjectDialog({
  open,
  project,
  submitting,
  onClose,
  onSubmit
}: {
  open: boolean
  project: ProjectRecord | null
  submitting: boolean
  onClose: () => void
  onSubmit: (input: CreateProjectInput) => void
}) {
  const [icon, setIcon] = useState(projectIconOptions[0])
  const [iconColor, setIconColor] = useState(colors[0])
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  useEffect(() => {
    if (!open) return
    setIcon(project?.icon || projectIconOptions[0])
    setIconColor(project?.iconColor || colors[0])
    setTitle(project?.title || '')
    setPrompt(project?.prompt || '')
  }, [open, project])
  return (
    <Modal
      open={open}
      title={project ? '编辑项目' : '新建项目'}
      width={440}
      centered
      classNames={{
        container: 'project-dialog-container',
        body: 'project-dialog-body',
        footer: 'project-dialog-footer'
      }}
      mask={{ closable: false }}
      confirmLoading={submitting}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ disabled: !title.trim() }}
      onCancel={onClose}
      onOk={() =>
        onSubmit({
          icon,
          iconColor,
          title: title.trim().slice(0, 20),
          prompt: prompt.trim().slice(0, 500)
        })
      }
    >
      <div className="project-dialog-form">
        <label>
          <span>图标</span>
          <div className="project-dialog-icons">
            {projectIconOptions.map((name) => (
              <button
                key={name}
                className={icon === name ? 'is-active' : ''}
                type="button"
                aria-label={`选择${name}图标`}
                onClick={() => setIcon(name)}
              >
                <ProjectIcon name={name} />
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>颜色</span>
          <ColorPicker
            className="project-dialog-color-picker"
            value={iconColor}
            format="hex"
            disabledAlpha
            presets={[{ label: '常用颜色', colors }]}
            showText={(color) => color.toHexString().toUpperCase()}
            onChange={(color) => setIconColor(color.toHexString())}
          />
        </label>
        <label>
          <span>标题</span>
          <Input
            value={title}
            maxLength={20}
            showCount
            placeholder="输入项目标题"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>提示词</span>
          <Input.TextArea
            value={prompt}
            rows={5}
            maxLength={500}
            showCount
            placeholder="输入该项目下会话默认携带的提示词"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
