import assert from 'assert'

import { buildLangChainMessages } from './ai'

const messages = buildLangChainMessages({
  latestUserMessage: '看看明天的天气',
  latestUserMessageAt: new Date('2026-07-30T07:33:00.000Z'),
  timeZone: 'Asia/Shanghai',
  memoryContext: [],
  conversationHistory: [
    {
      role: 'user',
      content: '上次杭州什么时候出梅？',
      createdAt: new Date('2026-06-23T05:53:00.000Z')
    },
    {
      role: 'assistant',
      content: '预计六月底出梅。',
      createdAt: new Date('2026-06-23T05:54:00.000Z')
    }
  ],
  speechStyle: 'default'
})

assert.ok(
  String(messages[0]?.content).includes('Asia/Shanghai'),
  'system message should identify the browser time zone'
)
assert.strictEqual(
  messages[1]?.content,
  '[发送时间：2026-06-23 13:53]\n上次杭州什么时候出梅？'
)
assert.strictEqual(messages[2]?.content, '预计六月底出梅。')
assert.strictEqual(
  messages[3]?.content,
  '[发送时间：2026-07-30 15:33]\n看看明天的天气'
)

const fallbackMessages = buildLangChainMessages({
  latestUserMessage: '现在几点？',
  latestUserMessageAt: new Date('2026-07-30T07:33:00.000Z'),
  timeZone: 'invalid/time-zone',
  memoryContext: [],
  conversationHistory: [],
  speechStyle: 'default'
})

assert.ok(String(fallbackMessages[0]?.content).includes('Asia/Shanghai'))
assert.strictEqual(
  fallbackMessages[1]?.content,
  '[发送时间：2026-07-30 15:33]\n现在几点？'
)
