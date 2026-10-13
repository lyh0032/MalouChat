const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('../web/node_modules/typescript')
const i18next = require('../web/node_modules/i18next')
const zh = require('../web/src/i18n/locales/zh-CN.json')
const en = require('../web/src/i18n/locales/en-US.json')

function flatten(value, prefix = '') {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const full = prefix ? `${prefix}.${key}` : key
      return typeof item === 'string' ? [[full, item]] : Object.entries(flatten(item, full))
    })
  )
}

function loadTs(filename, imports, globals = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  vm.runInNewContext(
    source,
    {
      exports,
      require: (name) => {
        assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name} in ${filename}`)
        return imports[name]
      },
      console,
      ...globals
    },
    { filename }
  )
  return exports
}

function createHarness(language = 'zh-CN') {
  let currentLanguage = language
  let token = ''
  let state
  let saveCalls = 0
  const notices = []
  const user = (id = 'a', language = 'zh-CN') => ({
    id,
    language,
    username: id,
    type: 'registered',
    speechStyle: 'default'
  })
  let apiUser = user()
  let save = async (language) => ({ language })
  const api = {
    login: async () => ({ token: 'token', user: apiUser }),
    register: async () => ({ token: 'token', user: apiUser }),
    loginAsGuest: async () => ({
      token: 'token',
      user: { ...apiUser, type: 'guest' },
      guestKey: 'guest-key'
    }),
    fetchMe: async () => apiUser,
    logoutSession: async () => {}
  }
  const store = loadTs('web/src/stores/auth.ts', {
    zustand: {
      create: (initialize) => {
        const set = (patch) => {
          state = { ...state, ...patch }
        }
        state = initialize(set, () => state)
        return { getState: () => state }
      }
    },
    '../api/auth': api,
    '../api/user': {
      updateUserLanguage: async (language) => {
        saveCalls++
        return save(language)
      }
    },
    '../utils/token': {
      getStoredToken: () => token,
      setStoredToken: (value) => {
        token = value
      },
      clearStoredToken: () => {
        token = ''
      }
    },
    '../utils/guest-identity': {
      getStoredGuestIdentity: () => null,
      setStoredGuestIdentity: () => {}
    },
    './reset': { resetUserScopedStores: () => {} },
    '../utils/toast': { toast: { error: (message) => notices.push(message) } },
    '../i18n': {
      getUiLanguage: () => currentLanguage,
      setUiLanguage: (value) => {
        currentLanguage = value
      },
      normalizeLanguage: (value) => (value === 'en-US' ? 'en-US' : 'zh-CN'),
      t: (key) => key
    }
  }).useAuthStore
  return {
    state: () => store.getState(),
    language: () => currentLanguage,
    notices,
    saveCalls: () => saveCalls,
    setSave: (value) => {
      save = value
    },
    setUser: (value) => {
      apiUser = value
    },
    setToken: (value) => {
      token = value
    },
    user
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('both catalogues cover the same keys and interpolation variables', () => {
  const a = flatten(zh),
    b = flatten(en)
  const normalized = (key) => key.replace(/_one$/, '_other')
  assert.deepEqual(
    [...new Set(Object.keys(a).map(normalized))].sort(),
    [...new Set(Object.keys(b).map(normalized))].sort()
  )
  for (const [key, value] of Object.entries(a)) {
    assert.ok(b[key], `Missing English translation: ${key}`)
    const variables = (value) =>
      [...value.matchAll(/\{\{(.*?)\}\}/g)].map((match) => match[1]).sort()
    assert.deepEqual(variables(value), variables(b[key]), `Interpolation mismatch: ${key}`)
    assert.doesNotMatch(b[key], /[\u3400-\u9fff]/u, `Untranslated English entry: ${key}`)
  }
  const sourceKeys = require('../web/src/i18n/source-keys.json')
  Object.values(sourceKeys).forEach((key) =>
    assert.ok(a[key] && b[key], `Missing source mapping ${key}`)
  )
})

test('real i18next handles live language changes, plurals, interpolation, and Chinese fallback', async () => {
  const i18n = i18next.createInstance()
  await i18n.init({
    resources: { 'zh-CN': { translation: zh }, 'en-US': { translation: en } },
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false }
  })
  assert.equal(i18n.t('ui.save'), '保存')
  await i18n.changeLanguage('en-US')
  assert.equal(i18n.t('ui.save'), 'Save')
  assert.equal(i18n.t('counts.assets', { count: 1 }), '1 asset')
  assert.equal(i18n.t('counts.assets', { count: 2 }), '2 assets')
  assert.equal(i18n.t('ui.deleteValue', { v0: '中文文件.txt' }), 'Delete “中文文件.txt”?')
  i18n.addResource('zh-CN', 'translation', 'test.fallback', '回退')
  assert.equal(i18n.t('test.fallback'), '回退')
})

test('anonymous selection is local; existing account and restored sessions override it', async () => {
  const h = createHarness()
  await h.state().setLanguage('en-US')
  assert.equal(h.language(), 'en-US')
  assert.equal(h.saveCalls(), 0)
  await h.state().login({})
  assert.equal(h.language(), 'zh-CN')
  const restored = createHarness('zh-CN')
  restored.setUser(restored.user('b', 'en-US'))
  restored.setToken('existing-token')
  await restored.state().restoreSession()
  assert.equal(restored.language(), 'en-US')
  assert.equal(restored.state().user.language, 'en-US')
})

test('saving language updates the UI immediately, serializes requests, and persists account state', async () => {
  const h = createHarness()
  await h.state().login({})
  const request = deferred()
  h.setSave(() => request.promise)
  const saving = h.state().setLanguage('en-US')
  assert.equal(h.language(), 'en-US')
  assert.equal(h.state().isSavingLanguage, true)
  await h.state().setLanguage('zh-CN')
  assert.equal(h.saveCalls(), 1)
  request.resolve({ language: 'en-US' })
  await saving
  assert.equal(h.state().user.language, 'en-US')
  assert.equal(h.state().isSavingLanguage, false)
})

test('failed save rolls back language, leaves account preference intact, and enables retry', async () => {
  const h = createHarness()
  await h.state().login({})
  h.setSave(async () => {
    throw new Error('Offline')
  })
  await h.state().setLanguage('en-US')
  assert.equal(h.language(), 'zh-CN')
  assert.equal(h.state().user.language, 'zh-CN')
  assert.equal(h.state().isSavingLanguage, false)
  assert.equal(h.notices.length, 1)
})

test('late save results cannot change a different signed-in account', async () => {
  const h = createHarness()
  await h.state().login({})
  const request = deferred()
  h.setSave(() => request.promise)
  const saving = h.state().setLanguage('en-US')
  h.state().logout()
  h.setUser(h.user('b', 'zh-CN'))
  await h.state().login({})
  request.reject(new Error('Late failure'))
  await saving
  assert.equal(h.language(), 'zh-CN')
  assert.equal(h.state().user.id, 'b')
  assert.equal(h.state().isSavingLanguage, false)
  assert.equal(h.notices.length, 0)
})

test('the language schema accepts only the two supported languages', () => {
  const { updateLanguageBodySchema } = loadTs('server/src/modules/users/user.language.ts', {
    zod: require('../server/node_modules/zod')
  })
  for (const language of ['zh-CN', 'en-US'])
    assert.equal(updateLanguageBodySchema.parse({ language }).language, language)
  for (const language of ['fr-FR', 'en', '', null, undefined])
    assert.equal(updateLanguageBodySchema.safeParse({ language }).success, false)
})

test('language bootstrap restores the local cache, updates HTML lang, and tolerates unavailable storage', () => {
  const instance = i18next.createInstance()
  const values = new Map([['malou-ui-language', 'en-US']])
  const document = { documentElement: { lang: '' } }
  const module = loadTs(
    'web/src/i18n/index.ts',
    {
      i18next: instance,
      'react-i18next': { initReactI18next: { type: '3rdParty', init() {} } },
      './source-keys.json': require('../web/src/i18n/source-keys.json'),
      './locales/zh-CN.json': zh,
      './locales/en-US.json': en
    },
    {
      document,
      localStorage: {
        getItem: (key) => values.get(key),
        setItem: (key, value) => values.set(key, value)
      }
    }
  )
  assert.equal(module.getUiLanguage(), 'en-US')
  assert.equal(document.documentElement.lang, 'en-US')
  module.setUiLanguage('zh-CN')
  assert.equal(document.documentElement.lang, 'zh-CN')
  assert.equal(values.get('malou-ui-language'), 'zh-CN')
  assert.equal(module.translateSource('Thinking deeply...'), '正在深度思考...')
  assert.equal(module.translateSource('Searching the web...'), '正在联网检索相关信息...')
  assert.equal(module.normalizeLanguage('fr-FR'), 'zh-CN')
  const unavailable = loadTs(
    'web/src/i18n/index.ts',
    {
      i18next: i18next.createInstance(),
      'react-i18next': { initReactI18next: { type: '3rdParty', init() {} } },
      './source-keys.json': require('../web/src/i18n/source-keys.json'),
      './locales/zh-CN.json': zh,
      './locales/en-US.json': en
    },
    {
      document,
      localStorage: {
        getItem() {
          throw new Error('Unavailable')
        },
        setItem() {
          throw new Error('Unavailable')
        }
      }
    }
  )
  assert.equal(unavailable.getUiLanguage(), 'zh-CN')
})

test('frontend error localization uses error codes, preserves Chinese messages in Chinese, and handles unknown errors', () => {
  const instance = i18next.createInstance()
  instance.init({ resources: { 'en-US': { translation: en } }, lng: 'en-US' })
  let language = 'en-US'
  const { localizeErrorMessage } = loadTs('web/src/i18n/errors.ts', {
    './index': {
      __esModule: true,
      default: instance,
      getUiLanguage: () => language,
      t: (key) => instance.t(key),
      translateSource: (source) => source
    }
  })
  assert.equal(localizeErrorMessage('邮箱已被使用', 'EMAIL_TAKEN'), 'This email is already in use')
  assert.equal(localizeErrorMessage('未知错误'), 'Request failed')
  assert.equal(localizeErrorMessage('Network error'), 'Network error')
  language = 'zh-CN'
  assert.equal(localizeErrorMessage('邮箱已被使用', 'EMAIL_TAKEN'), '邮箱已被使用')
})
