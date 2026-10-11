import assert from 'assert'

import {
  buildAssetId,
  decodeAssetId,
  getAssetCategoryLabel,
  getDeleteBlockedReason,
  getGeneratedImageFileName
} from './library-asset.service'

const assetRef = {
  category: 'generated_image' as const,
  sourceId: 'message_1',
  storageKey: 'obs/123-image.png'
}

const encoded = buildAssetId(assetRef)
assert.deepStrictEqual(decodeAssetId(encoded), assetRef)

assert.strictEqual(getAssetCategoryLabel('user_file'), '用户上传文件')
assert.strictEqual(getAssetCategoryLabel('user_image'), '用户上传图片')
assert.strictEqual(getAssetCategoryLabel('generated_image'), '文生图')
assert.strictEqual(getAssetCategoryLabel('knowledge_base_attachment'), '知识库附件')
assert.strictEqual(
  getGeneratedImageFileName(new Date('2026-07-02T09:08:00.000Z')),
  'AI生成图片-20260702-0908.png'
)

assert.strictEqual(
  getDeleteBlockedReason({
    hasActiveDraft: false,
    hasActiveConversation: true,
    hasActiveMessage: false,
    hasActiveKnowledgeBase: false
  }),
  '资料仍被存在的对话引用，不能删除'
)

assert.strictEqual(
  getDeleteBlockedReason({
    hasActiveDraft: false,
    hasActiveConversation: false,
    hasActiveMessage: true,
    hasActiveKnowledgeBase: false
  }),
  '资料仍被存在的消息引用，不能删除'
)

assert.strictEqual(
  getDeleteBlockedReason({
    hasActiveDraft: false,
    hasActiveConversation: false,
    hasActiveMessage: false,
    hasActiveKnowledgeBase: true
  }),
  '资料仍被存在的知识库引用，不能删除'
)

assert.strictEqual(
  getDeleteBlockedReason({
    hasActiveDraft: true,
    hasActiveConversation: false,
    hasActiveMessage: false,
    hasActiveKnowledgeBase: false
  }),
  '资料正在被新建会话引用，不能删除'
)

assert.strictEqual(
  getDeleteBlockedReason({
    hasActiveDraft: false,
    hasActiveConversation: false,
    hasActiveMessage: false,
    hasActiveKnowledgeBase: false
  }),
  null
)
