import type { Request, Response } from 'express'

import { createMemory, deleteMemory, listMemories, updateMemory } from './memory.service'
import type { MemoryQuery } from './memory.schema'
import { sendDeleted, sendSuccess } from '../../utils/http'

type MemoryParams = {
  memoryId: string
}

export async function listMemoriesController(req: Request, res: Response) {
  const data = await listMemories(req.currentUser!.id, req.query as MemoryQuery)
  sendSuccess(res, data, '获取记忆列表成功')
}

export async function createMemoryController(req: Request, res: Response) {
  const memory = await createMemory(req.currentUser!.id, req.body)
  sendSuccess(res, memory, '创建记忆成功', 201)
}

export async function updateMemoryController(req: Request<MemoryParams>, res: Response) {
  const memory = await updateMemory(req.currentUser!.id, req.params.memoryId, req.body)
  sendSuccess(res, memory, '更新记忆成功')
}

export async function deleteMemoryController(req: Request<MemoryParams>, res: Response) {
  await deleteMemory(req.currentUser!.id, req.params.memoryId)
  sendDeleted(res, '删除记忆成功')
}
