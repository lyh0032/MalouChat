import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button, Slider } from 'antd'
import {
  ArrowLeftOutlined,
  ApartmentOutlined,
  BranchesOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  SearchOutlined,
  ShareAltOutlined
} from '@ant-design/icons'
import { Graph } from '@antv/g6'
import { useNavigate } from 'react-router-dom'

import architectureGraphData from '../generated/architecture-graph.json'
import type {
  ArchitectureEdge,
  ArchitectureFlow,
  ArchitectureGraph,
  ArchitectureNode
} from '../types/architecture'

import './ArchitectureView.css'

const graphData = architectureGraphData as ArchitectureGraph
const MIN_ZOOM = 0.12
const MAX_ZOOM = 1.8

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function edgeStroke(edge: ArchitectureEdge) {
  return (
    (
      {
        ai: '#7c3aed',
        capability: '#cbd5e1',
        data: '#ea580c',
        deploy: '#475569',
        http: '#0891b2',
        internal: '#64748b',
        product: '#0f766e',
        sse: '#16a34a',
        storage: '#d97706',
        tool: '#9333ea'
      } as Record<string, string>
    )[edge.type] ?? '#94a3b8'
  )
}

export default function ArchitectureView() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const zoomRef = useRef(1)
  const pinchRef = useRef({ distance: 0, zoom: 1 })
  const [layerId, setLayerId] = useState(graphData.layers[0]?.id ?? 'product')
  const [flowId, setFlowId] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [mobilePanel, setMobilePanel] = useState<'copy' | 'graph'>('copy')
  const [zoom, setZoom] = useState(1)

  const layersById = useMemo(
    () => new Map(graphData.layers.map((layer) => [layer.id, layer])),
    [graphData]
  )
  const groupsById = useMemo(
    () => new Map(graphData.groups.map((group) => [group.id, group])),
    [graphData]
  )
  const nodesById = useMemo(
    () => new Map(graphData.nodes.map((node) => [node.id, node])),
    [graphData]
  )
  const layer = layersById.get(layerId) ?? graphData.layers[0]
  const layerNodes = useMemo(
    () => graphData.nodes.filter((node) => node.layer === layerId),
    [graphData, layerId]
  )
  const moduleNodes = useMemo(
    () => layerNodes.filter((node) => node.nodeType === 'module'),
    [layerNodes]
  )
  const capabilityNodes = useMemo(
    () => layerNodes.filter((node) => node.nodeType === 'capability'),
    [layerNodes]
  )
  const layerNodeIds = useMemo(() => new Set(layerNodes.map((node) => node.id)), [layerNodes])
  const flows = useMemo(
    () => graphData.flows.filter((flow) => flow.steps.some((step) => layerNodeIds.has(step))),
    [graphData, layerNodeIds]
  )
  const edges = useMemo(
    () =>
      graphData.edges.filter(
        (edge) => layerNodeIds.has(edge.source) && layerNodeIds.has(edge.target)
      ),
    [graphData, layerNodeIds]
  )
  const selectedFlow = flows.find((flow) => flow.id === flowId) ?? flows[0]
  const currentNode = nodesById.get(nodeId)
  const selectedNode = currentNode?.layer === layerId ? currentNode : moduleNodes[0]
  const selectedCapabilities =
    selectedNode?.nodeType === 'module'
      ? capabilityNodes.filter((node) => node.parentId === selectedNode.id)
      : []
  const selectedParent = selectedNode?.parentId ? nodesById.get(selectedNode.parentId) : undefined
  const selectedGroup = selectedNode ? groupsById.get(selectedNode.group) : undefined

  useEffect(() => {
    const firstFlow = flows[0]
    if (!flows.some((flow) => flow.id === flowId)) setFlowId(firstFlow?.id ?? '')
    const firstNodeId =
      firstFlow?.steps.find((step) => layerNodeIds.has(step)) ?? layerNodes[0]?.id ?? ''
    if (!currentNode || currentNode.layer !== layerId) setNodeId(firstNodeId)
  }, [currentNode, flowId, flows, layerId, layerNodeIds, layerNodes])

  const nodeHtml = useCallback(
    (node: ArchitectureNode) => {
      const group = groupsById.get(node.group)
      const capability = node.nodeType === 'capability'
      return `<div class="architecture-graph-node${capability ? ' architecture-graph-node--capability' : ''}" style="--node-color:${group?.color ?? '#2563eb'}"><div class="architecture-graph-node-title">${escapeHtml(node.label)}</div><div class="architecture-graph-node-summary">${escapeHtml(node.summary)}</div>${capability ? '' : `<div class="architecture-graph-node-meta">${escapeHtml(group?.label ?? node.group)}</div>`}</div>`
    },
    [groupsById]
  )

  const renderGraph = useCallback(() => {
    const container = containerRef.current
    if (!container || !container.clientWidth || !container.clientHeight) return
    graphRef.current?.destroy()
    const graph = new Graph({
      container,
      width: Math.max(container.clientWidth, 320),
      height: Math.max(container.clientHeight, 360),
      data: {
        nodes: layerNodes.map((node) => ({
          id: node.id,
          type: 'html',
          data: { ...node },
          style: {
            size: node.nodeType === 'capability' ? [184, 72] : [220, 88],
            dx: node.nodeType === 'capability' ? -92 : -110,
            dy: node.nodeType === 'capability' ? -36 : -44,
            pointerEvents: 'none',
            innerHTML: nodeHtml(node)
          }
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          data: { ...edge },
          style: {
            stroke: edgeStroke(edge),
            lineWidth: edge.type === 'capability' ? 1 : 1.4,
            pointerEvents: 'none',
            endArrow: edge.type !== 'capability',
            labelText: edge.type === 'capability' ? '' : edge.label,
            labelFill: '#64748b',
            labelFontSize: 10,
            labelMaxWidth: 140,
            labelOffsetY: -10,
            labelPointerEvents: 'none',
            labelBackground: true,
            labelBackgroundFill: '#fff',
            labelBackgroundOpacity: 0.92,
            labelBackgroundRadius: 4,
            labelBackgroundPadding: [3, 5]
          }
        }))
      },
      node: { type: 'html' },
      edge: { type: 'polyline' },
      layout: { type: 'dagre', rankdir: 'TB', nodesep: 72, ranksep: 118 },
      behaviors: ['drag-canvas'],
      plugins: [
        { type: 'minimap', size: [120, 78], position: 'right-bottom' },
        { type: 'grid-line', size: 24 }
      ]
    })
    graphRef.current = graph
    void graph.render().then(async () => {
      await graph.fitView({ when: 'always', direction: 'both' })
      const nextZoom = graph.getZoom()
      zoomRef.current = nextZoom
      setZoom(nextZoom)
    })
  }, [edges, layerNodes, nodeHtml])

  useEffect(() => {
    if (mobilePanel === 'graph' || window.innerWidth > 980) requestAnimationFrame(renderGraph)
  }, [mobilePanel, renderGraph])

  useEffect(() => {
    const resize = () => {
      const container = containerRef.current
      if (container && graphRef.current && container.clientWidth && container.clientHeight)
        graphRef.current.setSize(
          Math.max(container.clientWidth, 320),
          Math.max(container.clientHeight, 360)
        )
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      graphRef.current?.destroy()
      graphRef.current = null
    }
  }, [])

  function applyZoom(value: number, origin?: [number, number], duration = 180) {
    const graph = graphRef.current
    const container = containerRef.current
    if (!graph || !container) return
    const next = Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
    zoomRef.current = next
    setZoom(next)
    void graph.zoomTo(
      next,
      duration ? { duration } : false,
      origin ?? [container.clientWidth / 2, container.clientHeight / 2]
    )
  }

  function selectFlow(flow: ArchitectureFlow) {
    setFlowId(flow.id)
    setNodeId(flow.steps.find((step) => layerNodeIds.has(step)) ?? nodeId)
    setMobilePanel('copy')
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/chat')
  }

  const stats = [
    { label: "核心模块", value: moduleNodes.length },
    { label: "代表能力", value: capabilityNodes.length },
    { label: "模块关系", value: edges.length }
  ]

  return (
    <main className="architecture-page" lang="zh-CN">
      <div className="architecture-mobile-tabs">
        <button
          className={mobilePanel === 'copy' ? 'is-active' : ''}
          type="button"
          onClick={() => setMobilePanel('copy')}
        >
          文字说明
        </button>
        <button
          className={mobilePanel === 'graph' ? 'is-active' : ''}
          type="button"
          onClick={() => setMobilePanel('graph')}
        >
          图形架构
        </button>
      </div>
      <section className={`architecture-copy${mobilePanel !== 'copy' ? ' is-mobile-hidden' : ''}`}>
        <div className="architecture-topbar">
          <Button
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label="返回"
            onClick={goBack}
          />
          <div>
            <span className="architecture-eyebrow">Project Architecture</span>
            <h1>{graphData.title}</h1>
          </div>
        </div>
        <p className="architecture-description">{graphData.description}</p>
        <div className="architecture-layer-switch">
          {graphData.layers.map((item) => (
            <button
              key={item.id}
              className={layerId === item.id ? 'is-active' : ''}
              type="button"
              onClick={() => setLayerId(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <div className="architecture-stats">
          {stats.map((item) => (
            <div key={item.label} className="architecture-stat">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <section className="architecture-panel">
          <div className="architecture-panel-title">
            <BranchesOutlined />
            <span>{`${layer?.label}链路`}</span>
          </div>
          <div className="architecture-flow-list">
            {flows.map((flow) => (
              <button
                key={flow.id}
                className={`architecture-flow-item${selectedFlow?.id === flow.id ? ' architecture-flow-item--active' : ''}`}
                type="button"
                onClick={() => selectFlow(flow)}
              >
                <span>{flow.label}</span>
                <small>{`${flow.steps.length} 个节点`}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="architecture-panel architecture-panel--detail">
          <div className="architecture-detail-block">
            <div className="architecture-detail-heading">
              <ApartmentOutlined />
              <strong>{selectedFlow?.label}</strong>
            </div>
            <p>{selectedFlow?.description}</p>
            <div className="architecture-step-list">
              {selectedFlow?.steps.map((step) => (
                <button
                  key={step}
                  className={`architecture-step${selectedNode?.id === step ? ' architecture-step--active' : ''}`}
                  type="button"
                  onClick={() => setNodeId(step)}
                >
                  {nodesById.get(step)?.label}
                </button>
              ))}
            </div>
          </div>
          <div className="architecture-detail-block">
            <div className="architecture-node-detail-heading">
              <div className="architecture-detail-heading">
                <NodeIndexOutlined />
                <strong>{selectedNode?.label}</strong>
              </div>
              {selectedParent ? (
                <Button
                  type="link"
                  size="small"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => setNodeId(selectedParent.id)}
                >
                  返回所属模块
                </Button>
              ) : null}
            </div>
            <p>{selectedNode?.details}</p>
            {selectedCapabilities.length ? (
              <div className="architecture-capabilities">
                <strong>代表能力</strong>
                {selectedCapabilities.map((capability) => (
                  <button
                    key={capability.id}
                    type="button"
                    onClick={() => setNodeId(capability.id)}
                  >
                    <b>{capability.label}</b>
                    <span>{capability.summary}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="architecture-tag-list">
              {selectedGroup ? (
                <span
                  className="architecture-tag architecture-tag--group"
                  style={{ '--tag-color': selectedGroup.color } as CSSProperties}
                >
                  {selectedGroup.label}
                </span>
              ) : null}
              {selectedNode?.tags.map((tag) => (
                <span key={tag} className="architecture-tag">
                  {tag}
                </span>
              ))}
            </div>
            <div className="architecture-files">
              <div className="architecture-files-title">
                <FileTextOutlined />
                <span>关键文件</span>
              </div>
              {selectedNode?.files.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          </div>
        </section>
      </section>
      <section
        className={`architecture-graph${mobilePanel !== 'graph' ? ' is-mobile-hidden' : ''}`}
      >
        <div className="architecture-graph-toolbar">
          <div>
            <div className="architecture-graph-title">
              <div className="architecture-graph-heading">
                <ShareAltOutlined />
                <span>{`${layer?.label}图`}</span>
              </div>
              <div className="architecture-layer-switch architecture-layer-switch--graph">
                {graphData.layers.map((item) => (
                  <button
                    key={item.id}
                    className={layerId === item.id ? 'is-active' : ''}
                    type="button"
                    onClick={() => setLayerId(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <p>{layer?.description}</p>
          </div>
        </div>
        <div
          className="architecture-canvas-wrap"
          onWheel={(event) => {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            applyZoom(
              zoomRef.current * Math.exp(-event.deltaY * 0.0015),
              [event.clientX - rect.left, event.clientY - rect.top],
              0
            )
          }}
          onTouchStart={(event) => {
            if (event.touches.length === 2) {
              event.preventDefault()
              pinchRef.current = {
                distance: Math.hypot(
                  event.touches[0].clientX - event.touches[1].clientX,
                  event.touches[0].clientY - event.touches[1].clientY
                ),
                zoom: zoomRef.current
              }
            }
          }}
          onTouchMove={(event) => {
            if (event.touches.length !== 2 || !pinchRef.current.distance) return
            event.preventDefault()
            const distance = Math.hypot(
              event.touches[0].clientX - event.touches[1].clientX,
              event.touches[0].clientY - event.touches[1].clientY
            )
            applyZoom((pinchRef.current.zoom * distance) / pinchRef.current.distance, undefined, 0)
          }}
          onTouchEnd={(event) => {
            if (event.touches.length < 2) pinchRef.current.distance = 0
          }}
        >
          <div ref={containerRef} className="architecture-graph-canvas" />
          <div className="architecture-zoom-controls">
            <button
              type="button"
              aria-label="缩小架构图"
              onClick={() => applyZoom(zoomRef.current - 0.16)}
            >
              -
            </button>
            <Slider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              tooltip={{ open: false }}
              onChange={(value) => applyZoom(value)}
            />
            <button
              type="button"
              aria-label="放大架构图"
              onClick={() => applyZoom(zoomRef.current + 0.16)}
            >
              +
            </button>
            <button
              type="button"
              aria-label="重置架构图"
              onClick={() => {
                applyZoom(1)
                void graphRef.current?.fitCenter({ duration: 180 })
              }}
            >
              1:1
            </button>
          </div>
        </div>
        <div className="architecture-search-hint">
          <SearchOutlined />
          <span>拖动画布查看关系；桌面端可滚动鼠标滚轮，移动端可双指缩放。</span>
        </div>
      </section>
    </main>
  )
}
