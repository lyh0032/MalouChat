import type { Request, Response } from 'express'

import { sendDeleted, sendSuccess } from '../../utils/http'
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject
} from './project.service'

type ProjectParams = {
  projectId: string
}

export async function listProjectsController(req: Request, res: Response) {
  const projects = await listProjects(req.currentUser!.id)
  sendSuccess(res, { projects }, '获取项目列表成功')
}

export async function createProjectController(req: Request, res: Response) {
  const project = await createProject(req.currentUser!.id, req.body)
  sendSuccess(res, project, '创建项目成功', 201)
}

export async function updateProjectController(req: Request<ProjectParams>, res: Response) {
  const project = await updateProject(req.currentUser!.id, req.params.projectId, req.body)
  sendSuccess(res, project, '更新项目成功')
}

export async function deleteProjectController(req: Request<ProjectParams>, res: Response) {
  await deleteProject(req.currentUser!.id, req.params.projectId)
  sendDeleted(res, '删除项目成功')
}
