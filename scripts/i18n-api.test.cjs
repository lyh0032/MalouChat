// Run explicitly against the local server: node scripts/i18n-api.test.cjs
// Creates only temporary test identities and removes them in finally.
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const path = require('node:path')
require('../server/node_modules/dotenv').config({
  path: path.resolve(__dirname, '../server/.env'),
  quiet: true
})
const { PrismaClient } = require('../server/node_modules/@prisma/client')
const prisma = new PrismaClient()
const base = process.env.I18N_TEST_API_URL || 'http://localhost:5172/api'
const created = []
async function request(endpoint, body, token, method = 'POST') {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000)
  })
  const json = await response.json()
  return { status: response.status, ...json }
}
async function verifyPreference(session) {
  assert.equal(session.status, 200)
  assert.equal(session.data.user.language, 'en-US')
  const token = session.data.token
  const denied = await request('/users/me/language', { language: 'zh-CN' })
  assert.equal(denied.status, 401)
  const invalid = await request('/users/me/language', { language: 'fr-FR' }, token, 'PATCH')
  assert.equal(invalid.status, 400)
  const changed = await request('/users/me/language', { language: 'zh-CN' }, token, 'PATCH')
  assert.equal(changed.status, 200)
  assert.equal(changed.data.language, 'zh-CN')
  const me = await request('/auth/me', null, token, 'GET')
  assert.equal(me.data.language, 'zh-CN')
  const row = await prisma.user.findUnique({
    where: { id: session.data.user.id },
    select: { language: true }
  })
  assert.equal(row.language, 'zh-CN')
}
async function main() {
  try {
    const guest = await request('/auth/guest', { language: 'en-US' })
    assert.equal(guest.status, 200)
    created.push(guest.data.user.id)
    await verifyPreference(guest)
    const recovered = await request('/auth/guest', {
      guestKey: guest.data.guestKey,
      language: 'en-US'
    })
    assert.equal(recovered.data.user.id, guest.data.user.id)
    assert.equal(recovered.data.user.language, 'zh-CN')

    const suffix = randomBytes(6).toString('hex')
    const username = `i18n_test_${suffix}`
    const password = createHash('sha256').update(randomBytes(32)).digest('hex')
    const registered = await request('/auth/register', {
      email: `${username}@example.invalid`,
      username,
      password,
      language: 'en-US'
    })
    assert.equal(registered.status, 201)
    created.push(registered.data.user.id)
    const login = await request('/auth/login', { emailOrUsername: username, password })
    await verifyPreference(login)
    const relogin = await request('/auth/login', { emailOrUsername: username, password })
    assert.equal(relogin.data.user.language, 'zh-CN')
    console.log(
      'Passed: new identity defaults, account persistence, sign-in restore, guest recovery, authentication, and unsupported-language validation'
    )
  } finally {
    if (created.length) {
      await prisma.user.deleteMany({
        where: {
          id: { in: created },
          OR: [{ type: 'guest' }, { username: { startsWith: 'i18n_test_' } }]
        }
      })
    }
    await prisma.$disconnect()
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
