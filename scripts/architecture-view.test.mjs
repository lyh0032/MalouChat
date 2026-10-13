import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../web/src/views/ArchitectureView.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../web/src/views/ArchitectureView.css', import.meta.url), 'utf8')

test('G6 graph is read-only and keeps canvas dragging', () => {
  assert.match(source, /behaviors:\s*\['drag-canvas'\]/)
  assert.doesNotMatch(source, /drag-element|click-select/)
  assert.match(source, /pointerEvents:\s*'none'/)
  assert.match(source, /labelPointerEvents:\s*'none'/)
})

test('architecture page exposes bounded wheel and pinch zoom', () => {
  assert.match(source, /const MIN_ZOOM = 0?\.12/)
  assert.match(source, /const MAX_ZOOM = 1\.8/)
  assert.match(source, /onWheel=\{/)
  assert.match(source, /onTouchStart=\{/)
  assert.match(source, /event\.touches\.length === 2/)
  assert.match(source, /className="architecture-zoom-controls"/)
  assert.match(styles, /touch-action:\s*none;/)
})

test('graph uses one vertical layout with room for labels', () => {
  assert.match(source, /rankdir:\s*'TB'/)
  assert.match(source, /nodesep:\s*72/)
  assert.match(source, /ranksep:\s*118/)
  assert.match(source, /labelOffsetY:\s*-10/)
  assert.match(source, /labelMaxWidth:\s*140/)
})

test('mobile switches between copy and graph while sharing layer state', () => {
  assert.match(source, /mobilePanel === 'copy'/)
  assert.match(source, /mobilePanel === 'graph'/)
  assert.match(source, /architecture-layer-switch architecture-layer-switch--graph/)
  assert.match(styles, /@media\s*\(max-width:\s*980px\)/)
  assert.match(styles, /\.architecture-layer-switch--graph\s*\{[^}]*display:\s*grid/)
  assert.match(styles, /\.architecture-mobile-tabs,\s*\.architecture-copy,\s*\.architecture-graph\s*\{[^}]*grid-column:\s*1/)
  assert.match(styles, /\.architecture-copy\.is-mobile-hidden,\s*\.architecture-graph\.is-mobile-hidden\s*\{[^}]*display:\s*none/)
})

test('module details expose representative capabilities and source files', () => {
  assert.match(source, /selectedCapabilities/)
  assert.match(source, /selectedParent/)
  assert.ok(source.includes("t('ui.backToParentModule')"))
  assert.ok(source.includes("t('ui.keyFiles')"))
  assert.match(styles, /\.architecture-graph-node--capability/)
})

test('initial graph view fits the complete layer and is cleaned up', () => {
  assert.match(source, /graph\.fitView\(\{ when: 'always', direction: 'both' \}\)/)
  assert.match(source, /graphRef\.current\?\.destroy\(\)/)
  assert.match(source, /window\.removeEventListener\('resize', resize\)/)
})
