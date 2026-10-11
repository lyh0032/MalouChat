import assert from 'assert'

import {
  buildProjectPayload,
  formatProjectPromptContext,
  formatProjectSummary
} from './project.service'

const payload = buildProjectPayload({
  icon: 'sparkles',
  iconColor: '#4f46e5',
  title: '  一个超过二十个字符的项目标题用于测试截断  ',
  prompt: `  ${'保持专业。'.repeat(120)}  `
})

assert.strictEqual(payload.icon, 'sparkles')
assert.strictEqual(payload.iconColor, '#4f46e5')
assert.strictEqual(payload.title.length, 20)
assert.strictEqual(payload.title, '一个超过二十个字符的项目标题用于测试截断')
assert.strictEqual(payload.prompt.length, 500)
assert.ok(payload.prompt.startsWith('保持专业。'))

const summary = formatProjectSummary({
  id: 'project_1',
  icon: 'folder',
  iconColor: '#0f766e',
  title: '项目',
  prompt: '项目提示词',
  createdAt: new Date('2026-07-03T00:00:00.000Z'),
  updatedAt: new Date('2026-07-03T01:00:00.000Z'),
  _count: {
    conversations: 3
  }
})

assert.deepStrictEqual(summary, {
  id: 'project_1',
  icon: 'folder',
  iconColor: '#0f766e',
  title: '项目',
  prompt: '项目提示词',
  conversationCount: 3,
  createdAt: new Date('2026-07-03T00:00:00.000Z'),
  updatedAt: new Date('2026-07-03T01:00:00.000Z')
})

const context = formatProjectPromptContext({
  title: '写作项目',
  prompt: '只使用中文回答，保持简洁。'
})

assert.ok(context.includes('写作项目'))
assert.ok(context.includes('只使用中文回答，保持简洁。'))
assert.strictEqual(formatProjectPromptContext({ title: '空项目', prompt: '   ' }), '')
