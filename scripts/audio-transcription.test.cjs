const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')

test('audio transcription is exposed as an authenticated conversation-independent API', () => {
  const moduleSource = readFileSync('server/src/modules/index.ts', 'utf8')
  const routeSource = readFileSync('server/src/modules/audio/audio.routes.ts', 'utf8')
  const controllerSource = readFileSync('server/src/modules/audio/audio.controller.ts', 'utf8')

  assert.match(moduleSource, /apiRouter\.use\('\/audio', audioRouter\)/)
  assert.match(routeSource, /router\.use\(authMiddleware\)/)
  assert.match(routeSource, /router\.post\('\/transcribe'/)
  assert.doesNotMatch(controllerSource, /conversationId/)
})

test('the composer transcribes audio without requiring or sending a conversation id', () => {
  const apiSource = readFileSync('web/src/api/audio.ts', 'utf8')
  const composerSource = readFileSync('web/src/components/chat/MessageComposer.tsx', 'utf8')

  assert.match(apiSource, /transcribeAudio\(audioBlob: Blob/)
  assert.match(apiSource, /fetchWithAuth\('\/audio\/transcribe'/)
  assert.doesNotMatch(apiSource, /conversationId/)
  assert.match(composerSource, /transcribeAudio\(blob, controller\.signal\)/)
  assert.doesNotMatch(composerSource, /请先创建或选择一个会话/)
})

test('the message router does not expose a conversation-scoped audio alias', () => {
  const routeSource = readFileSync('server/src/modules/messages/message.routes.ts', 'utf8')

  assert.doesNotMatch(routeSource, /'\/audio\/transcribe'/)
  assert.doesNotMatch(routeSource, /audioFileUpload/)
  assert.doesNotMatch(routeSource, /transcribeAudioController/)
})
