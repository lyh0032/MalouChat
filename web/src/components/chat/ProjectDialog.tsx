import { useTranslation } from 'react-i18next'
import { t } from '../../i18n'
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
  useTranslation()
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
      closable={{ 'aria-label': t('ui.close') }}
      open={open}
      title={project ? t('ui.editProject') : t('ui.newProject')}
      width={440}
      centered
      classNames={{
        container: 'project-dialog-container',
        body: 'project-dialog-body',
        footer: 'project-dialog-footer'
      }}
      mask={{ closable: false }}
      confirmLoading={submitting}
      okText={t('ui.confirm')}
      cancelText={t('ui.cancel')}
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
          <span>{t('ui.icon')}</span>
          <div className="project-dialog-icons">
            {projectIconOptions.map((name) => (
              <button
                key={name}
                className={icon === name ? 'is-active' : ''}
                type="button"
                aria-label={t('ui.selectTheValueIcon', { v0: name })}
                onClick={() => setIcon(name)}
              >
                <ProjectIcon name={name} />
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>{t('ui.color')}</span>
          <ColorPicker
            className="project-dialog-color-picker"
            value={iconColor}
            format="hex"
            disabledAlpha
            presets={[{ label: t('ui.commonColors'), colors }]}
            showText={(color) => color.toHexString().toUpperCase()}
            onChange={(color) => setIconColor(color.toHexString())}
          />
        </label>
        <label>
          <span>{t('ui.title')}</span>
          <Input
            value={title}
            maxLength={20}
            showCount
            placeholder={t('ui.enterAProjectTitle')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>{t('ui.instructions')}</span>
          <Input.TextArea
            value={prompt}
            rows={5}
            maxLength={500}
            showCount
            placeholder={t('ui.enterInstructionsForConversationsInThisProject')}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
