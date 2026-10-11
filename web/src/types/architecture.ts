export interface ArchitectureLayer {
  id: string
  label: string
  description: string
}

export interface ArchitectureGroup {
  id: string
  label: string
  color: string
}

export type ArchitectureNodeType = 'module' | 'capability'

export interface ArchitectureNode {
  id: string
  label: string
  layer: string
  group: string
  nodeType: ArchitectureNodeType
  parentId?: string
  summary: string
  details: string
  files: string[]
  tags: string[]
}

export interface ArchitectureEdge {
  source: string
  target: string
  label: string
  type: string
}

export interface ArchitectureFlow {
  id: string
  label: string
  description: string
  steps: string[]
}

export interface ArchitectureGraph {
  version: number
  title: string
  description: string
  layers: ArchitectureLayer[]
  groups: ArchitectureGroup[]
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
  flows: ArchitectureFlow[]
}
