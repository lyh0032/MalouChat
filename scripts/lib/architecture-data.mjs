const ARCHITECTURE_BLOCK_RE = /```architecture-json\s*([\s\S]*?)\s*```/

export function extractArchitectureGraph(markdown) {
  const match = markdown.match(ARCHITECTURE_BLOCK_RE)
  if (!match) {
    throw new Error('Missing architecture-json block in AGENTS.md')
  }

  let graph
  try {
    graph = JSON.parse(match[1])
  } catch (error) {
    throw new Error(`Invalid architecture-json block: ${error.message}`)
  }

  validateArchitectureGraph(graph)
  return graph
}

export function validateArchitectureGraph(graph) {
  if (!graph || typeof graph !== 'object') {
    throw new Error('Architecture graph must be an object')
  }

  assertString(graph.title, 'title')
  assertArray(graph.layers, 'layers')
  assertArray(graph.groups, 'groups')
  assertArray(graph.nodes, 'nodes')
  assertArray(graph.edges, 'edges')
  assertArray(graph.flows, 'flows')

  const layerIds = new Set()
  for (const layer of graph.layers) {
    assertString(layer.id, 'layers[].id')
    assertString(layer.label, 'layers[].label')
    assertString(layer.description, 'layers[].description')
    if (layerIds.has(layer.id)) {
      throw new Error(`Duplicate layer id "${layer.id}"`)
    }
    layerIds.add(layer.id)
  }

  const groupIds = new Set()
  for (const group of graph.groups) {
    assertString(group.id, 'groups[].id')
    assertString(group.label, 'groups[].label')
    if (groupIds.has(group.id)) {
      throw new Error(`Duplicate group id "${group.id}"`)
    }
    groupIds.add(group.id)
  }

  const nodeIds = new Set()
  const nodesById = new Map()
  for (const node of graph.nodes) {
    assertString(node.id, 'nodes[].id')
    assertString(node.label, 'nodes[].label')
    assertString(node.layer, `nodes[${node.id}].layer`)
    assertString(node.group, `nodes[${node.id}].group`)
    assertString(node.nodeType, `nodes[${node.id}].nodeType`)
    assertString(node.summary, `nodes[${node.id}].summary`)
    assertString(node.details, `nodes[${node.id}].details`)
    assertArray(node.files, `nodes[${node.id}].files`)
    assertArray(node.tags, `nodes[${node.id}].tags`)

    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id "${node.id}"`)
    }
    if (!layerIds.has(node.layer)) {
      throw new Error(`Unknown layer "${node.layer}" for node "${node.id}"`)
    }
    if (!groupIds.has(node.group)) {
      throw new Error(`Unknown group "${node.group}" for node "${node.id}"`)
    }
    if (!['module', 'capability'].includes(node.nodeType)) {
      throw new Error(`Unknown node type "${node.nodeType}" for node "${node.id}"`)
    }
    if (node.nodeType === 'module' && node.parentId !== undefined) {
      throw new Error(`Module node "${node.id}" cannot declare parentId`)
    }
    nodeIds.add(node.id)
    nodesById.set(node.id, node)
  }

  for (const node of graph.nodes) {
    if (node.nodeType !== 'capability') continue

    const parent = nodesById.get(node.parentId)
    if (!parent || parent.nodeType !== 'module' || parent.layer !== node.layer) {
      throw new Error(
        `Capability node "${node.id}" must reference a module parent in the same layer`,
      )
    }
  }

  for (const edge of graph.edges) {
    assertString(edge.source, 'edges[].source')
    assertString(edge.target, 'edges[].target')
    assertString(edge.label, 'edges[].label')
    assertString(edge.type, 'edges[].type')

    if (!nodeIds.has(edge.source)) {
      throw new Error(`Unknown source node "${edge.source}"`)
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Unknown target node "${edge.target}"`)
    }
  }

  for (const flow of graph.flows) {
    assertString(flow.id, 'flows[].id')
    assertString(flow.label, 'flows[].label')
    assertArray(flow.steps, `flows[${flow.id}].steps`)
    for (const step of flow.steps) {
      if (!nodeIds.has(step)) {
        throw new Error(`Unknown flow step "${step}" in flow "${flow.id}"`)
      }
      if (nodesById.get(step).nodeType === 'capability') {
        throw new Error(`Flow "${flow.id}" cannot include capability node "${step}"`)
      }
    }
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`Architecture graph field "${fieldName}" must be an array`)
  }
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Architecture graph field "${fieldName}" must be a non-empty string`)
  }
}
