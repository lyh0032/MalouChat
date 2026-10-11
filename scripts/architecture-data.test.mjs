import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  extractArchitectureGraph,
  validateArchitectureGraph,
} from './lib/architecture-data.mjs'

test('extracts architecture-json block from AGENTS markdown', () => {
  const markdown = [
    '# AGENTS.md',
    '',
    '```architecture-json',
    '{',
    '  "version": 1,',
    '  "title": "Demo",',
    '  "layers": [{"id": "technical", "label": "技术层", "description": "技术实现"}],',
    '  "groups": [{"id": "frontend", "label": "前端", "color": "#2563eb"}],',
    '  "nodes": [{"id": "web", "label": "Web", "layer": "technical", "group": "frontend", "nodeType": "module", "summary": "React", "details": "React app", "files": [], "tags": []}],',
    '  "edges": [],',
    '  "flows": []',
    '}',
    '```',
  ].join('\n')

  const graph = extractArchitectureGraph(markdown)

  assert.equal(graph.title, 'Demo')
  assert.equal(graph.nodes[0].id, 'web')
})

test('validates edge and flow references against graph nodes', () => {
  const graph = {
    version: 1,
    title: 'Demo',
    layers: [{ id: 'technical', label: '技术层', description: '技术实现' }],
    groups: [{ id: 'frontend', label: '前端', color: '#2563eb' }],
    nodes: [
      {
        id: 'web',
        label: 'Web',
        layer: 'technical',
        group: 'frontend',
        nodeType: 'module',
        summary: 'React',
        details: 'React app',
        files: [],
        tags: [],
      },
      {
        id: 'api',
        label: 'API',
        layer: 'technical',
        group: 'frontend',
        nodeType: 'module',
        summary: 'Express',
        details: 'Express api',
        files: [],
        tags: [],
      },
    ],
    edges: [{ source: 'web', target: 'api', label: '/api', type: 'http' }],
    flows: [{ id: 'auth', label: '登录链路', steps: ['web', 'api'] }],
  }

  assert.doesNotThrow(() => validateArchitectureGraph(graph))
})

test('rejects architecture graph with missing node references', () => {
  const graph = {
    version: 1,
    title: 'Demo',
    layers: [{ id: 'technical', label: '技术层', description: '技术实现' }],
    groups: [{ id: 'frontend', label: '前端', color: '#2563eb' }],
    nodes: [
      {
        id: 'web',
        label: 'Web',
        layer: 'technical',
        group: 'frontend',
        nodeType: 'module',
        summary: 'React',
        details: 'React app',
        files: [],
        tags: [],
      },
    ],
    edges: [{ source: 'web', target: 'api', label: '/api', type: 'http' }],
    flows: [{ id: 'auth', label: '登录链路', steps: ['web', 'api'] }],
  }

  assert.throws(
    () => validateArchitectureGraph(graph),
    /Unknown target node "api"/,
  )
})

test('rejects nodes without a known architecture layer', () => {
  const graph = {
    version: 1,
    title: 'Demo',
    layers: [{ id: 'technical', label: '技术层', description: '技术实现' }],
    groups: [{ id: 'frontend', label: '前端', color: '#2563eb' }],
    nodes: [
      {
        id: 'web',
        label: 'Web',
        layer: 'mixed',
        group: 'frontend',
        nodeType: 'module',
        summary: 'React',
        details: 'React app',
        files: [],
        tags: [],
      },
    ],
    edges: [],
    flows: [],
  }

  assert.throws(
    () => validateArchitectureGraph(graph),
    /Unknown layer "mixed"/,
  )
})

function createCapabilityGraph() {
  return {
    version: 1,
    title: 'Demo',
    layers: [{ id: 'product', label: '产品层', description: '用户能力' }],
    groups: [{ id: 'product', label: '产品', color: '#0f766e' }],
    nodes: [
      {
        id: 'module',
        label: '主模块',
        layer: 'product',
        group: 'product',
        nodeType: 'module',
        summary: '主模块摘要',
        details: '主模块详情',
        files: [],
        tags: [],
      },
      {
        id: 'capability',
        label: '代表能力',
        layer: 'product',
        group: 'product',
        nodeType: 'capability',
        parentId: 'module',
        summary: '能力摘要',
        details: '能力详情',
        files: [],
        tags: [],
      },
    ],
    edges: [
      {
        source: 'module',
        target: 'capability',
        label: '代表能力',
        type: 'capability',
      },
    ],
    flows: [{ id: 'product-flow', label: '产品链路', steps: ['module'] }],
  }
}

test('accepts a capability with a same-layer module parent', () => {
  assert.doesNotThrow(() => validateArchitectureGraph(createCapabilityGraph()))
})

test('rejects a capability without a valid module parent', () => {
  const graph = createCapabilityGraph()
  graph.nodes[1].parentId = 'missing-module'

  assert.throws(
    () => validateArchitectureGraph(graph),
    /Capability node "capability" must reference a module parent in the same layer/,
  )
})

test('rejects a module that declares a parent', () => {
  const graph = createCapabilityGraph()
  graph.nodes[0].parentId = 'another-module'

  assert.throws(
    () => validateArchitectureGraph(graph),
    /Module node "module" cannot declare parentId/,
  )
})

test('rejects capability nodes in architecture flows', () => {
  const graph = createCapabilityGraph()
  graph.flows[0].steps.push('capability')

  assert.throws(
    () => validateArchitectureGraph(graph),
    /Flow "product-flow" cannot include capability node "capability"/,
  )
})

test('documents tool runtime external service dependencies in AGENTS architecture data', async () => {
  const markdown = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')
  const graph = extractArchitectureGraph(markdown)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const edgeKeys = new Set(graph.edges.map((edge) => `${edge.source}->${edge.target}`))

  for (const nodeId of [
    'tool-runtime',
    'browser-client-tools',
    'external-dashscope-websearch',
    'external-dashscope-image',
    'external-amap',
    'external-storage',
  ]) {
    assert.ok(nodeById.has(nodeId), `Expected architecture node "${nodeId}"`)
  }

  assert.match(
    nodeById.get('external-dashscope-websearch').details,
    /bailian_web_search|DASHSCOPE_WEBSEARCH_MCP_URL/,
  )
  assert.match(
    nodeById.get('external-dashscope-image').details,
    /DASHSCOPE_IMAGE_GENERATION_URL|DASHSCOPE_IMAGE_MODEL/,
  )
  assert.match(
    nodeById.get('external-amap').details,
    /AMAP_REGEOCODE_URL|AMAP_API_KEY/,
  )

  for (const edgeKey of [
    'tool-runtime->external-dashscope-websearch',
    'tool-runtime->external-dashscope-image',
    'external-dashscope-image->external-storage',
    'tool-runtime->browser-client-tools',
    'browser-client-tools->external-amap',
  ]) {
    assert.ok(edgeKeys.has(edgeKey), `Expected architecture edge "${edgeKey}"`)
  }

  const toolFlow = graph.flows.find((flow) => flow.id === 'tool-external-flow')
  assert.ok(toolFlow, 'Expected tool external flow')
  for (const step of [
    'tool-runtime',
    'external-dashscope-websearch',
    'external-dashscope-image',
    'external-storage',
    'browser-client-tools',
    'external-amap',
  ]) {
    assert.ok(toolFlow.steps.includes(step), `Expected tool flow step "${step}"`)
  }
})

test('keeps architecture page copy focused on product capabilities, not interview framing', async () => {
  const markdown = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')
  const graph = extractArchitectureGraph(markdown)
  const serializedGraph = JSON.stringify(graph)
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const productFlow = graph.flows.find((flow) => flow.id === 'product-flow')

  assert.ok(!nodeIds.has('product-architecture'), 'Architecture page should not be a product module')
  assert.ok(!productFlow?.steps.includes('product-architecture'))
  assert.doesNotMatch(serializedGraph, /面试|面试官|面试展示/)
})

test('product layer documents full user-facing workflows instead of a simplified feature list', async () => {
  const markdown = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')
  const graph = extractArchitectureGraph(markdown)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const edgeKeys = new Set(graph.edges.map((edge) => `${edge.source}->${edge.target}`))
  const capabilityIds = new Set(
    graph.nodes.filter((node) => node.nodeType === 'capability').map((node) => node.id),
  )

  for (const nodeId of [
    'product-entry',
    'product-chat',
    'product-conversation-management',
    'product-message-operations',
    'product-ai-capabilities',
    'product-files',
    'product-memory',
    'product-preferences',
    'product-knowledge-management',
    'product-knowledge-collaboration',
    'product-knowledge-reference',
  ]) {
    assert.equal(nodeById.get(nodeId)?.layer, 'product', `Expected product node "${nodeId}"`)
    assert.equal(nodeById.get(nodeId)?.nodeType, 'module', `Expected module node "${nodeId}"`)
  }

  const expectedCapabilities = new Map([
    ['product-project-context', 'product-conversation-management'],
    ['product-conversation-movement', 'product-conversation-management'],
    ['product-conversation-find', 'product-conversation-management'],
    ['product-message-regenerate', 'product-message-operations'],
    ['product-stream-recovery', 'product-message-operations'],
    ['product-image-understanding', 'product-files'],
    ['product-large-file-qa', 'product-files'],
    ['product-memory-extraction', 'product-memory'],
    ['product-memory-control', 'product-memory'],
    ['product-web-search', 'product-ai-capabilities'],
    ['product-image-generation', 'product-ai-capabilities'],
    ['product-location-awareness', 'product-ai-capabilities'],
    ['product-model-style', 'product-preferences'],
    ['product-chat-model-governance', 'product-model-admin'],
    ['product-specialized-model-governance', 'product-model-admin'],
    ['product-knowledge-stable-update', 'product-knowledge-management'],
    ['product-knowledge-reindex', 'product-knowledge-management'],
    ['product-knowledge-visibility', 'product-knowledge-management'],
    ['product-invitation-lifecycle', 'product-knowledge-collaboration'],
    ['product-knowledge-roles', 'product-knowledge-collaboration'],
    ['product-membership-exit', 'product-knowledge-collaboration'],
    ['product-knowledge-preflight', 'product-knowledge-reference'],
    ['product-knowledge-revocation', 'product-knowledge-reference'],
    ['product-knowledge-retrieval', 'product-knowledge-reference'],
  ])

  for (const [nodeId, parentId] of expectedCapabilities) {
    const node = nodeById.get(nodeId)
    assert.equal(node?.layer, 'product', `Expected product capability "${nodeId}"`)
    assert.equal(node?.nodeType, 'capability', `Expected capability node "${nodeId}"`)
    assert.equal(node?.parentId, parentId, `Expected parent "${parentId}" for "${nodeId}"`)
    assert.ok(edgeKeys.has(`${parentId}->${nodeId}`), `Expected capability edge for "${nodeId}"`)
  }

  assert.equal(capabilityIds.size, expectedCapabilities.size)
  assert.ok(!nodeById.has('product-conversation-search'))
  assert.match(nodeById.get('product-project-context').details, /项目|提示词|上下文/)
  assert.match(nodeById.get('product-stream-recovery').details, /流式|恢复|中断/)
  assert.match(nodeById.get('product-memory-control').details, /查看|修改|删除/)
  assert.match(nodeById.get('product-knowledge-stable-update').details, /ID|重新上传/)
  assert.match(nodeById.get('product-knowledge-preflight').details, /发送|权限|提示/)
  assert.match(nodeById.get('product-knowledge-retrieval').details, /向量|关键词|长文档/)

  for (const edgeKey of [
    'product-chat->product-conversation-management',
    'product-chat->product-message-operations',
    'product-chat->product-ai-capabilities',
    'product-knowledge-management->product-knowledge-collaboration',
    'product-knowledge-collaboration->product-knowledge-reference',
    'product-knowledge-reference->product-chat',
  ]) {
    assert.ok(edgeKeys.has(edgeKey), `Expected product edge "${edgeKey}"`)
  }

  const chatFlow = graph.flows.find((flow) => flow.id === 'product-chat-flow')
  const knowledgeFlow = graph.flows.find((flow) => flow.id === 'product-knowledge-flow')
  assert.ok(chatFlow, 'Expected chat product flow')
  assert.ok(knowledgeFlow, 'Expected independent knowledge product flow')
  for (const flow of graph.flows) {
    for (const step of flow.steps) {
      assert.ok(!capabilityIds.has(step), `Flow "${flow.id}" should not include "${step}"`)
    }
  }
  assert.deepEqual(
    knowledgeFlow.steps,
    [
      'product-entry',
      'product-knowledge-management',
      'product-knowledge-collaboration',
      'product-knowledge-reference',
      'product-chat',
    ],
  )
})
