import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../web/src/components/chat/ChatSettingsDialog.tsx', import.meta.url),
  'utf8'
)
const styles = await readFile(
  new URL('../web/src/components/chat/ChatSettingsDialog.css', import.meta.url),
  'utf8'
)

test('architecture remains elevated while admin navigation lives in the sidebar', () => {
  assert.match(source, /onNavigate\('\/architecture'\)/)
  assert.match(source, />\s*技术架构\s*<\/Button>/)
  assert.doesNotMatch(source, /后台管理/)
  assert.doesNotMatch(source, /onNavigate\('\/admin'\)/)
  assert.match(source, /className="chat-settings-title-actions"/)
  assert.match(source, /loading=\{props\.loadingModels\}/)
  assert.match(source, /loading=\{props\.loadingSpeechStyles\}/)
})

test('settings content keeps native scrolling in a bounded modal body', () => {
  assert.match(styles, /\.chat-settings\s*\{[^}]*height:\s*min\(/)
  assert.match(styles, /\.chat-settings\s*\{[^}]*overflow-y:\s*auto;/)
  assert.match(styles, /scrollbar-gutter:\s*stable;/)
})
