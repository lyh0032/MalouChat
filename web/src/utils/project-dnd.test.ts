const assert = require('assert')
const { shouldMoveConversationProject } = require('./project-dnd')

assert.strictEqual(
  shouldMoveConversationProject({ currentProjectId: null, targetProjectId: null }),
  false
)

assert.strictEqual(
  shouldMoveConversationProject({ currentProjectId: 'project-a', targetProjectId: 'project-a' }),
  false
)

assert.strictEqual(
  shouldMoveConversationProject({ currentProjectId: null, targetProjectId: 'project-a' }),
  true
)

assert.strictEqual(
  shouldMoveConversationProject({ currentProjectId: 'project-a', targetProjectId: null }),
  true
)

assert.strictEqual(
  shouldMoveConversationProject({ currentProjectId: 'project-a', targetProjectId: 'project-b' }),
  true
)
