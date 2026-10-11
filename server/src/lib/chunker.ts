const HEADING_PATTERN = /^#{1,4}\s+|^[\u4e00-\u9fff]+[：:]\s*$|^[A-Z][^。！？\n]{0,30}[：:]\s*$/m
const TABLE_ROW_PATTERN = /^\|.+\|$/
const BULLET_PATTERN = /^[\s]*[-*+]\s/

export function chunkText(text: string, maxChunkSize = 500, overlap = 80): string[] {
  if (!text) return []

  const trimmed = text.trim()
  if (trimmed.length <= maxChunkSize * 1.5) return [trimmed]

  const blocks = splitIntoLogicalBlocks(trimmed)

  const chunks: string[] = []
  let currentChunk = ''

  for (const block of blocks) {
    const blockLines = Array.isArray(block) ? block.join('\n') : block
    const isHeading = !Array.isArray(block) && HEADING_PATTERN.test(block)

    if (isHeading && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = ''
    }

    if (blockLines.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      chunks.push(...splitLongBlock(blockLines, maxChunkSize, overlap))
      continue
    }

    if (currentChunk.length + blockLines.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      const overlapText = takeOverlapTail(currentChunk, overlap)
      currentChunk =
        overlapText && overlapText.length + blockLines.length + 2 <= maxChunkSize
          ? `${overlapText}\n\n${blockLines}`
          : blockLines
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${blockLines}` : blockLines
    }

    if (currentChunk.length > maxChunkSize * 2) {
      chunks.push(currentChunk.trim())
      currentChunk = ''
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter((c) => c.length > 0)
}

function splitLongBlock(text: string, maxChunkSize: number, overlap: number): string[] {
  const normalized = text.trim()
  if (!normalized) return []

  const chunks: string[] = []
  const safeOverlap = Math.max(0, Math.min(overlap, maxChunkSize - 1))
  const step = Math.max(1, maxChunkSize - safeOverlap)

  for (let start = 0; start < normalized.length; start += step) {
    const chunk = normalized.slice(start, start + maxChunkSize).trim()
    if (chunk) {
      chunks.push(chunk)
    }

    if (start + maxChunkSize >= normalized.length) {
      break
    }
  }

  return chunks
}

function takeOverlapTail(text: string, overlap: number): string {
  const trimmed = text.trim()
  if (!trimmed || overlap <= 0) return ''
  return trimmed.slice(Math.max(0, trimmed.length - overlap))
}

function splitIntoLogicalBlocks(text: string): Array<string | string[]> {
  const lines = text.split('\n')
  const blocks: Array<string | string[]> = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (TABLE_ROW_PATTERN.test(line)) {
      const table: string[] = []
      while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i])) {
        table.push(lines[i])
        i++
      }
      blocks.push(table)
      continue
    }

    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    if (HEADING_PATTERN.test(trimmed)) {
      blocks.push(trimmed)
      i++
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const cur = lines[i].trim()
      if (!cur || HEADING_PATTERN.test(cur) || TABLE_ROW_PATTERN.test(cur)) break
      para.push(cur)
      i++
    }

    if (para.length > 0) {
      blocks.push(para.join(' '))
    }
  }

  return blocks
}
