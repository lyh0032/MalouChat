const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'CommonJS',
  moduleResolution: 'Node'
})
require('../server/node_modules/ts-node/register/transpile-only')

function extractFunctionSource(source, name) {
  const start = source.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)

  const nextExport = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, nextExport === -1 ? undefined : nextExport)
}

test('streamMessage rejects when a conversation already has a generating assistant message', () => {
  const source = readFileSync('server/src/modules/messages/message.service.ts', 'utf8')
  const streamMessageSource = extractFunctionSource(source, 'streamMessage')

  assert.match(streamMessageSource, /await ensureNoGeneratingMessage\(conversationId\)/)
})

test('updateMessage rejects while an assistant message is still generating', () => {
  const source = readFileSync('server/src/modules/messages/message.service.ts', 'utf8')
  const updateMessageSource = extractFunctionSource(source, 'updateMessage')

  assert.match(updateMessageSource, /await ensureNoGeneratingMessage\(conversationId\)/)
})

test('regeneration history excludes the target user message and later messages', () => {
  const { buildConversationHistoryBeforeMessage } = require('../server/src/modules/messages/message-history.ts')
  const firstCreatedAt = new Date('2026-08-10T09:00:00.000Z')
  const firstAnswerCreatedAt = new Date('2026-08-10T09:00:01.000Z')
  const history = [
    { id: 'u1', role: 'user', content: 'first', createdAt: firstCreatedAt },
    { id: 'a1', role: 'assistant', content: 'first answer', createdAt: firstAnswerCreatedAt },
    { id: 'u2', role: 'user', content: 'regenerate this', createdAt: new Date('2026-08-10T09:00:02.000Z') },
    { id: 'a2', role: 'assistant', content: 'old answer', createdAt: new Date('2026-08-10T09:00:03.000Z') },
    { id: 'u3', role: 'user', content: 'later question', createdAt: new Date('2026-08-10T09:00:04.000Z') }
  ]

  assert.deepEqual(buildConversationHistoryBeforeMessage(history, 'u2'), [
    { role: 'user', content: 'first', createdAt: firstCreatedAt },
    { role: 'assistant', content: 'first answer', createdAt: firstAnswerCreatedAt }
  ])
})

test('the historical attachment boundary is injected only when the current message needs it', () => {
  const { buildLangChainMessages } = require('../server/src/lib/ai.ts')
  const buildSystemPrompt = (latestUserMessage, fileContext) =>
    String(
      buildLangChainMessages({
        latestUserMessage,
        memoryContext: [],
        conversationHistory: [],
        fileContext
      })[0].content
    )

  const ordinaryPrompt = buildSystemPrompt('帮我写一个周报')
  const historicalAttachmentPrompt = buildSystemPrompt('我刚刚发的图片具体在哪里？')
  const currentAttachmentPrompt = buildSystemPrompt(
    '分析我刚刚发的图片',
    '用户通过此消息上传了以下附件：\n- map.png'
  )

  assert.doesNotMatch(ordinaryPrompt, /暂时无法重新查看前面消息里的附件/)
  assert.match(historicalAttachmentPrompt, /只能读取你在当前这条消息中上传的图片或文件/)
  assert.match(historicalAttachmentPrompt, /不要推测刷新、传输中断或文件丢失/)
  assert.doesNotMatch(currentAttachmentPrompt, /暂时无法重新查看前面消息里的附件/)
})

test('the system prompt describes capabilities without exposing internal tool identifiers', () => {
  const { buildLangChainMessages } = require('../server/src/lib/ai.ts')
  const systemPrompt = String(
    buildLangChainMessages({
      latestUserMessage: '你可以调用什么工具？',
      memoryContext: [],
      conversationHistory: []
    })[0].content
  )

  assert.match(systemPrompt, /只用自然语言概括可提供的能力及适用场景/)
  assert.match(systemPrompt, /工具名称、函数名、参数 schema、工具数量/)
  assert.doesNotMatch(
    systemPrompt,
    /webSearchTool|drawImageTool|readFileTool|semanticSearchTool|getUserLocationTool/
  )
  assert.doesNotMatch(systemPrompt, /可用工具：/)
})

test('the last user message is editable only after generation or stopping has finished', () => {
  const { canEditLastUserMessage } = require('../web/src/utils/message-edit.ts')
  const messages = [
    { id: 'u1', role: 'user', status: 'completed' },
    { id: 'a1', role: 'assistant', status: 'completed' }
  ]

  assert.equal(canEditLastUserMessage(messages, messages[0], true), false)
  assert.equal(canEditLastUserMessage(messages, messages[0], false), true)
})

test('regeneration inherits deep-thinking state from the edited message response', () => {
  const { getRegenerationDeepThinkingEnabled } = require('../web/src/utils/message-edit.ts')
  const messages = [
    { id: 'u1', role: 'user', status: 'completed' },
    { id: 'a1', role: 'assistant', status: 'cancelled', deepThinkingEnabled: true }
  ]

  assert.equal(getRegenerationDeepThinkingEnabled(messages, 'u1'), true)
})

test('regenerateMessage passes deep-thinking state into the new assistant and stream task', () => {
  const source = readFileSync('server/src/modules/messages/message.service.ts', 'utf8')
  const regenerateMessageSource = extractFunctionSource(source, 'regenerateMessage')

  assert.match(
    regenerateMessageSource,
    /deepThinkingEnabled: data\.deepThinkingEnabled === true/
  )
  assert.match(regenerateMessageSource, /createStreamTask\([\s\S]*deepThinkingEnabled:/)
})

test('regeneration transports deep-thinking state from the frontend to the service', () => {
  const apiSource = readFileSync('web/src/api/chat.ts', 'utf8')
  const controllerSource = readFileSync('server/src/modules/messages/message.controller.ts', 'utf8')
  const routesSource = readFileSync('server/src/modules/messages/message.routes.ts', 'utf8')

  assert.match(apiSource, /body: JSON\.stringify\(input\)/)
  assert.match(controllerSource, /regenerateMessage\([\s\S]*req\.body,[\s\S]*buildStreamHandlers/)
  assert.match(
    routesSource,
    /validate\(\{ params: regenerateMessageParamsSchema, body: regenerateMessageBodySchema \}\)/
  )
})
