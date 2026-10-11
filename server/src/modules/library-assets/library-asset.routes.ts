import { Router } from 'express'

import { authMiddleware } from '../../middlewares/auth'
import { asyncHandler } from '../../utils/async-handler'
import {
  attachLibraryAssetController,
  deleteLibraryAssetController,
  listLibraryAssetsController,
  listSelectableLibraryAssetsController
} from './library-asset.controller'

const router = Router()

router.use(authMiddleware)
router.get('/selectable', asyncHandler(listSelectableLibraryAssetsController))
router.get('/', asyncHandler(listLibraryAssetsController))
router.post('/:assetId/attach', asyncHandler(attachLibraryAssetController))
router.delete('/:assetId', asyncHandler(deleteLibraryAssetController))

export { router as libraryAssetRouter }
