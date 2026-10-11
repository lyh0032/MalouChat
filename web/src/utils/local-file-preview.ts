type PreviewFileIdentity = {
  id?: string
  storageKey?: string
}

type PreviewEntry = {
  url: string
  keys: string[]
}

const MAX_PREVIEW_ENTRIES = 12
const previews = new Map<string, PreviewEntry>()
const entries = new Set<PreviewEntry>()

function identityKeys(file: PreviewFileIdentity) {
  return [file.id ? `id:${file.id}` : '', file.storageKey ? `storage:${file.storageKey}` : ''].filter(
    Boolean
  )
}

function findEntry(file: PreviewFileIdentity) {
  for (const key of identityKeys(file)) {
    const entry = previews.get(key)
    if (entry) return entry
  }
  return undefined
}

export function registerLocalFilePreview(file: PreviewFileIdentity, source: Blob) {
  const keys = identityKeys(file)
  if (!keys.length || typeof URL.createObjectURL !== 'function') return

  releaseLocalFilePreview(file)
  const entry: PreviewEntry = { url: URL.createObjectURL(source), keys }
  keys.forEach((key) => previews.set(key, entry))
  entries.add(entry)

  while (entries.size > MAX_PREVIEW_ENTRIES) {
    const oldest = entries.values().next().value as PreviewEntry | undefined
    if (!oldest) break
    releaseEntry(oldest)
  }
}

export function getLocalFilePreview(file: PreviewFileIdentity) {
  return findEntry(file)?.url
}

export function releaseLocalFilePreview(file: PreviewFileIdentity) {
  const entry = findEntry(file)
  if (!entry) return

  releaseEntry(entry)
}

function releaseEntry(entry: PreviewEntry) {
  entry.keys.forEach((key) => {
    if (previews.get(key) === entry) previews.delete(key)
  })
  entries.delete(entry)
  URL.revokeObjectURL(entry.url)
}
