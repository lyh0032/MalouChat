import type { Request, Response } from 'express'

import { sendDeleted, sendSuccess } from '../../utils/http'
import {
  attachLibraryAsset,
  deleteLibraryAsset,
  listLibraryAssets,
  listSelectableLibraryAssets
} from './library-asset.service'

export async function listLibraryAssetsController(req: Request, res: Response) {
  const data = await listLibraryAssets(req.currentUser!.id)
  sendSuccess(res, data, '获取资料库成功')
}

export async function listSelectableLibraryAssetsController(req: Request, res: Response) {
  const data = await listSelectableLibraryAssets(req.currentUser!.id, {
    query: typeof req.query.q === 'string' ? req.query.q : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined
  })
  sendSuccess(res, data, '获取可选资料成功')
}

export async function attachLibraryAssetController(
  req: Request<{ assetId: string }>,
  res: Response
) {
  const data = await attachLibraryAsset(req.currentUser!.id, req.params.assetId, {
    conversationId:
      typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined,
    conversationDraft: req.body?.conversationDraft === true
  })
  sendSuccess(res, data, '资料已添加')
}

export async function deleteLibraryAssetController(
  req: Request<{ assetId: string }>,
  res: Response
) {
  await deleteLibraryAsset(req.currentUser!.id, req.params.assetId)
  sendDeleted(res)
}
