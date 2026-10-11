import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractArchitectureGraph } from './lib/architecture-data.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(rootDir, 'AGENTS.md')
const outputPath = resolve(rootDir, 'web/src/generated/architecture-graph.json')

const markdown = await readFile(sourcePath, 'utf8')
const graph = extractArchitectureGraph(markdown)

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`)

console.log(`Generated ${outputPath}`)
