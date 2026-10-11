const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'CommonJS',
  moduleResolution: 'Node'
})
require('../server/node_modules/ts-node/register/transpile-only')

function extractFunctionSource(source, name) {
  const patterns = [
    `export async function ${name}`,
    `async function ${name}`,
    `function ${name}`
  ]
  const start = patterns
    .map((pattern) => source.indexOf(pattern))
    .find((index) => index >= 0)

  assert.notEqual(start, undefined, `${name} should exist`)

  const nextFunction = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction)
}

test('rate-limit image errors are converted to a concise Chinese message', () => {
  const {
    ImageGenerationProviderError,
    getFriendlyImageGenerationError
  } = require('../server/src/lib/tools/image-generation-error.ts')

  const message = getFriendlyImageGenerationError(
    new ImageGenerationProviderError(
      'Requests rate limit exceeded, see https://help.aliyun.com/example',
      429,
      'Throttling.RateQuota'
    )
  )

  assert.match(message, /请求较多|请求频繁/)
  assert.doesNotMatch(message, /https?:\/\//)
  assert.doesNotMatch(message, /Requests rate limit/i)
})

test('a late assistant message is inserted by creation time instead of appended', () => {
  const { findMessageInsertionIndex } = require('../web/src/utils/message-order.ts')
  const messages = [
    { id: 'u1', createdAt: '2026-07-23T10:00:00.000Z' },
    { id: 'u2', createdAt: '2026-07-23T10:00:02.000Z' }
  ]

  assert.equal(
    findMessageInsertionIndex(messages, {
      id: 'a1',
      createdAt: '2026-07-23T10:00:01.000Z'
    }),
    1
  )
})

test('tool runtime receives the stream abort signal and image requests use it', () => {
  const contextSource = readFileSync('server/src/lib/tool-context.ts', 'utf8')
  const aiSource = readFileSync('server/src/lib/ai.ts', 'utf8')
  const drawImageSource = readFileSync('server/src/lib/tools/drawImage.ts', 'utf8')

  assert.match(contextSource, /signal\?: AbortSignal/)
  assert.match(aiSource, /toolRuntimeContext:[\s\S]*signal/)
  assert.match(drawImageSource, /getToolContext\(\)/)
  assert.match(drawImageSource, /signal/)
})

test('the tool runner can stop waiting for a tool that ignores cancellation', async () => {
  const { waitForPromiseWithAbort } = require('../server/src/utils/abort.ts')
  const controller = new AbortController()
  const neverSettles = new Promise(() => undefined)
  const result = waitForPromiseWithAbort(neverSettles, controller.signal)

  controller.abort()

  await assert.rejects(result, (error) => error?.name === 'AbortError')
})

test('manual cancellation waits until the background task reaches a terminal state', () => {
  const source = readFileSync('server/src/modules/messages/message.service.ts', 'utf8')
  const cancelSource = extractFunctionSource(source, 'cancelMessageStream')

  assert.match(cancelSource, /task\.abortController\.abort\(\)/)
  assert.match(cancelSource, /await task\.completion/)
})

test('disconnecting an SSE subscriber does not cancel the background task', () => {
  const source = readFileSync('server/src/modules/messages/message.service.ts', 'utf8')
  const waitSource = extractFunctionSource(source, 'waitForTaskSubscription')
  const subscribeSource = extractFunctionSource(source, 'subscribeMessageStream')

  assert.doesNotMatch(waitSource, /task\.abortController\.abort\(\)/)
  assert.match(subscribeSource, /activeStreamTasks\.get\(messageId\)/)
  assert.match(subscribeSource, /replayAssistantMessage: true/)
})

test('the composer remains locked while a manual stop is being confirmed', () => {
  const panelSource = readFileSync('web/src/components/chat/ChatMainPanel.tsx', 'utf8')
  const storeSource = readFileSync('web/src/stores/chat.ts', 'utf8')

  assert.match(panelSource, /stopping:\s*boolean/)
  assert.match(panelSource, /loading=\{props\.streaming \|\| props\.stopping\}/)
  assert.match(storeSource, /sendActionInFlight/)
  assert.match(
    storeSource,
    /get\(\)\.activeConversationId === conversationId[\s\S]*upsertMessage\(result\.assistantMessage\)/
  )
})

test('conversation summaries and sidebar expose cross-conversation generating state', () => {
  const serviceSource = readFileSync(
    'server/src/modules/conversations/conversation.service.ts',
    'utf8'
  )
  const typeSource = readFileSync('web/src/types/chat.ts', 'utf8')
  const storeSource = readFileSync('web/src/stores/chat.ts', 'utf8')
  const listSource = readFileSync('web/src/components/chat/ChatSidebar.tsx', 'utf8')

  assert.match(serviceSource, /isGenerating:[\s\S]*message\.status === 'generating'/)
  assert.match(typeSource, /isGenerating: boolean/)
  assert.match(storeSource, /CONVERSATION_STATUS_POLL_INTERVAL_MS/)
  assert.match(storeSource, /some\(\(conversation\) => conversation\.isGenerating\)/)
  assert.match(listSource, /conversation\.isGenerating \? <LoadingOutlined spin \/>/)
})

test('rapid conversation switching only allows the latest route and detail request to commit', () => {
  const apiSource = readFileSync('web/src/api/chat.ts', 'utf8')
  const storeSource = readFileSync('web/src/stores/chat.ts', 'utf8')
  const viewSource = readFileSync('web/src/views/ChatView.tsx', 'utf8')

  assert.match(apiSource, /fetchConversationDetail\([\s\S]*signal\?: AbortSignal/)
  assert.match(apiSource, /`\/conversations\/\$\{conversationId\}`,[\s\S]*\{ signal \}/)
  assert.match(storeSource, /conversationSelectionSequence/)
  assert.match(storeSource, /conversationDetailAbortController\?\.abort\(\)/)
  assert.match(
    storeSource,
    /await fetchConversationDetail\(conversationId, controller\.signal\)[\s\S]*if \(!isCurrent\(\)\) return false[\s\S]*set\(\{ messages: detail\.messages \}\)/
  )
  assert.match(viewSource, /routeSequenceRef/)
  assert.match(
    viewSource,
    /async function selectConversation\(id: string\) \{[\s\S]*routeSequenceRef\.current \+= 1[\s\S]*navigate\(routeForConversation/
  )
  assert.match(
    viewSource,
    /const selected = await chat\.selectConversation\(conversationId\)[\s\S]*if \(!selected \|\| sequence !== routeSequenceRef\.current\) return[\s\S]*navigate\(canonical, \{ replace: true \}\)/
  )
})
