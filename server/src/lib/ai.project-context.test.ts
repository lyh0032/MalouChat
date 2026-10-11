import assert from 'assert'

import { buildLangChainMessages } from './ai'

const messages = buildLangChainMessages({
  latestUserMessage: '请介绍一下现在的计划',
  memoryContext: [],
  conversationHistory: [],
  projectContext:
    '当前会话属于项目「学英语」。\n以下是该项目的长期提示词：\n此项目下的会话，要求必须用英语回答',
  speechStyle: 'default'
})

const systemContent = messages[0]?.content

assert.strictEqual(typeof systemContent, 'string')
assert.ok(
  (systemContent as string).includes('此项目下的会话，要求必须用英语回答'),
  'project prompt should be included in the system message'
)
assert.ok(
  (systemContent as string).includes('学英语'),
  'project title should be included in the system message'
)
