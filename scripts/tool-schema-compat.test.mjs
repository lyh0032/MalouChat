import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { zodToJsonSchema } from '../server/node_modules/zod-to-json-schema/dist/cjs/index.js'
import { z } from '../server/node_modules/zod/v3/index.cjs'

const toolSchemaFiles = [
  'server/src/lib/tools/drawImage.ts',
  'server/src/lib/tools/readFile.ts',
  'server/src/lib/tools/semanticSearch.ts',
  'server/src/lib/tools/userLocation.ts',
  'server/src/lib/tools/webSearch.ts'
]

test('tool schemas use zod v3 for OpenAI-compatible JSON schema conversion', () => {
  for (const file of toolSchemaFiles) {
    const source = readFileSync(file, 'utf8')

    assert.match(source, /from ['"]zod\/v3['"]/, `${file} should import zod from zod/v3`)
  }
})

test('zod v3 tool schema exposes required query parameter to zod-to-json-schema', () => {
  const schema = z.object({
    query: z.string().describe('搜索语句')
  })

  const jsonSchema = zodToJsonSchema(schema)

  assert.equal(jsonSchema.type, 'object')
  assert.deepEqual(jsonSchema.required, ['query'])
  assert.equal(jsonSchema.properties?.query?.type, 'string')
})
