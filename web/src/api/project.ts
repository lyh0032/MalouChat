import type { ApiResponse } from '../types/api'
import type { CreateProjectInput, ProjectRecord, UpdateProjectInput } from '../types/project'
import { http } from './http'

export async function fetchProjects(): Promise<ProjectRecord[]> {
  const response = await http.get<ApiResponse<{ projects: ProjectRecord[] }>>('/projects')
  return response.data.data.projects
}

export async function createProject(input: CreateProjectInput): Promise<ProjectRecord> {
  const response = await http.post<ApiResponse<ProjectRecord>>('/projects', input)
  return response.data.data
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput
): Promise<ProjectRecord> {
  const response = await http.patch<ApiResponse<ProjectRecord>>(`/projects/${projectId}`, input)
  return response.data.data
}

export async function deleteProject(projectId: string): Promise<void> {
  await http.delete(`/projects/${projectId}`)
}
