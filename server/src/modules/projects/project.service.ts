import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import { AppError } from '../../utils/app-error'
import type { CreateProjectBody, UpdateProjectBody } from './project.schema'

type ProjectPayloadInput = {
  icon: string
  iconColor: string
  title: string
  prompt?: string | null
}

type ProjectSummaryRecord = {
  id: string
  icon: string
  iconColor: string
  title: string
  prompt: string
  createdAt: Date
  updatedAt: Date
  _count: {
    conversations: number
  }
}

type ProjectPromptRecord = {
  title: string
  prompt: string | null
}

const projectSummaryInclude = {
  _count: {
    select: {
      conversations: true
    }
  }
} satisfies Prisma.ProjectInclude

const projectListOrderBy = [
  { createdAt: 'desc' }
] satisfies Prisma.ProjectOrderByWithRelationInput[]

function trimLimit(value: string | null | undefined, limit: number) {
  return (value ?? '').trim().slice(0, limit)
}

export function buildProjectPayload(input: ProjectPayloadInput) {
  return {
    icon: trimLimit(input.icon, 40),
    iconColor: trimLimit(input.iconColor, 32),
    title: trimLimit(input.title, 20),
    prompt: trimLimit(input.prompt, 500)
  }
}

export function buildProjectUpdatePayload(input: UpdateProjectBody) {
  const data: Record<string, string> = {}

  if (input.icon !== undefined) {
    data.icon = trimLimit(input.icon, 40)
  }

  if (input.iconColor !== undefined) {
    data.iconColor = trimLimit(input.iconColor, 32)
  }

  if (input.title !== undefined) {
    data.title = trimLimit(input.title, 20)
  }

  if (input.prompt !== undefined) {
    data.prompt = trimLimit(input.prompt, 500)
  }

  return data
}

export function formatProjectSummary(project: ProjectSummaryRecord) {
  return {
    id: project.id,
    icon: project.icon,
    iconColor: project.iconColor,
    title: project.title,
    prompt: project.prompt,
    conversationCount: project._count.conversations,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function formatProjectPromptContext(project: ProjectPromptRecord | null | undefined) {
  const prompt = project?.prompt?.trim()
  const title = project?.title?.trim()

  if (!prompt) {
    return ''
  }

  return [
    `当前会话属于项目「${title || '未命名项目'}」。`,
    '以下是该项目的长期提示词。回答本项目下的所有问题时必须严格遵守。项目提示词中的语言、格式、角色和风格要求，优先于助手默认回答语言、用户语气偏好、用户当前输入语言和普通历史习惯；如果项目提示词要求使用某种语言，除非用户当前明确要求改用另一种语言，否则必须使用项目要求的语言回答。只有当它与系统安全规则、工具规则或用户当前明确要求冲突时，才不执行冲突部分：',
    prompt
  ].join('\n')
}

export async function listProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: projectListOrderBy,
    include: projectSummaryInclude
  })

  return projects.map(formatProjectSummary)
}

export async function createProject(userId: string, data: CreateProjectBody) {
  const project = await prisma.project.create({
    data: {
      userId,
      ...buildProjectPayload(data)
    },
    include: projectSummaryInclude
  })

  return formatProjectSummary(project)
}

export async function updateProject(userId: string, projectId: string, data: UpdateProjectBody) {
  await ensureProjectOwnership(userId, projectId)

  const project = await prisma.project.update({
    where: { id: projectId },
    data: buildProjectUpdatePayload(data),
    include: projectSummaryInclude
  })

  return formatProjectSummary(project)
}

export async function deleteProject(userId: string, projectId: string) {
  await ensureProjectOwnership(userId, projectId)
  await prisma.project.delete({ where: { id: projectId } })
}

export async function ensureProjectOwnership(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true }
  })

  if (!project) {
    throw new AppError(404, '项目不存在', 'PROJECT_NOT_FOUND')
  }

  return project
}

export async function normalizeProjectId(userId: string, projectId?: string | null) {
  if (!projectId) {
    return null
  }

  await ensureProjectOwnership(userId, projectId)
  return projectId
}

export async function buildProjectPromptContext(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId
    },
    select: {
      projectId: true,
      project: {
        select: {
          title: true,
          prompt: true
        }
      }
    }
  })

  if (!conversation) {
    throw new AppError(404, '会话不存在', 'NOT_FOUND')
  }

  console.log('[project-prompt] context-loaded', {
    conversationId,
    projectId: conversation.projectId,
    hasProject: Boolean(conversation.project),
    promptLength: conversation.project?.prompt?.trim().length ?? 0
  })

  return formatProjectPromptContext(conversation.project)
}
