import type { ArchitectureGraph } from '../types/architecture'
import i18n from './index'

export function localizeArchitecture(source: ArchitectureGraph): ArchitectureGraph {
  function visit(value: unknown, key: string): unknown {
    if (Array.isArray(value))
      return value.map((item, index) =>
        visit(item, `${key}.${item && typeof item === 'object' && 'id' in item ? item.id : index}`)
      )
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, visit(item, `${key}.${name}`)])
      )
    if (typeof value === 'string' && /[\u3400-\u9fff]/u.test(value))
      return i18n.t(key, { keySeparator: false, ns: 'architecture', defaultValue: value })
    return value
  }
  return visit(source, 'graph') as ArchitectureGraph
}
