import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../web/src/views/LoginView.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../web/src/views/LoginView.css', import.meta.url), 'utf8')

test('login and register share one route-driven React page', () => {
  assert.match(source, /location\.pathname === '\/register'/)
  assert.match(source, /navigate\(mode === 'register' \? '\/register' : '\/login'\)/)
  assert.match(source, /<LiquidGlassSwitch/)
})

test('auth architecture entry is outside the card', () => {
  assert.match(source, /<\/Card>\s*<Link className="auth-architecture-entry" to="\/architecture">/)
  assert.match(styles, /\.auth-architecture-entry\s*\{/)
})
