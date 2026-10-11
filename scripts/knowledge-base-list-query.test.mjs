import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('knowledge base list query selects only lightweight fields', async () => {
  const source = await readFile(
    new URL('../server/src/modules/knowledge-bases/knowledge-base.service.ts', import.meta.url),
    'utf8',
  )
  const listFunctionStart = source.indexOf('export async function listKnowledgeBases')
  const nextFunctionStart = source.indexOf('export async function ensureAccessibleKnowledgeBase')
  const listFunctionBody = source.slice(listFunctionStart, nextFunctionStart)

  assert.match(
    listFunctionBody,
    /prisma\.knowledgeBase\.findMany\(\{[\s\S]*?\n    select:\s*{/,
    'listKnowledgeBases must use a top-level select',
  )
  assert.doesNotMatch(
    listFunctionBody,
    /indexingContent:\s*true/,
    'listKnowledgeBases must not fetch large indexingContent field',
  )
})
