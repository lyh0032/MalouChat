import { Router } from 'express'

import { authRouter } from './auth/auth.routes'
import { conversationRouter } from './conversations/conversation.routes'
import { messageRouter } from './messages/message.routes'
import { memoryRouter } from './memories/memory.routes'
import { modelPreferenceRouter } from './model-preferences/model-preference.routes'
import { fileRouter } from './files/file.routes'
import { knowledgeBaseRouter } from './knowledge-bases/knowledge-base.routes'
import { libraryAssetRouter } from './library-assets/library-asset.routes'
import { projectRouter } from './projects/project.routes'
import { userPreferenceRouter } from './user-preferences/user-preference.routes'
import { userRouter } from './users/user.routes'
import { adminModelRouter } from './admin-models/admin-model.routes'
import { audioRouter } from './audio/audio.routes'
import { conversationDraftRouter } from './conversation-drafts/conversation-draft.routes'

const apiRouter = Router()

apiRouter.use('/auth', authRouter)
apiRouter.use('/audio', audioRouter)
apiRouter.use('/conversations', conversationRouter)
apiRouter.use('/conversation-draft', conversationDraftRouter)
apiRouter.use('/conversations/:conversationId/messages', messageRouter)
apiRouter.use('/memories', memoryRouter)
apiRouter.use('/projects', projectRouter)
apiRouter.use('/knowledge-bases', knowledgeBaseRouter)
apiRouter.use('/model-preferences', modelPreferenceRouter)
apiRouter.use('/user-preferences', userPreferenceRouter)
apiRouter.use('/users', userRouter)
apiRouter.use('/files', fileRouter)
apiRouter.use('/library-assets', libraryAssetRouter)
apiRouter.use('/admin/models', adminModelRouter)

export { apiRouter }
