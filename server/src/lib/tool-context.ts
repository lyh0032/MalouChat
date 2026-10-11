import { AsyncLocalStorage } from 'async_hooks'

export type UserLocationCoordinates = {
  latitude: number
  longitude: number
  accuracy?: number
}

export type ToolRuntimeContext = {
  userId?: string
  conversationId?: string
  signal?: AbortSignal
  requestClientTool?: (toolName: string, params?: unknown) => Promise<unknown>
}

const toolContextStorage = new AsyncLocalStorage<ToolRuntimeContext>()

export function runWithToolContext<T>(
  context: ToolRuntimeContext | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return toolContextStorage.run(context ?? {}, fn)
}

export function getToolContext(): ToolRuntimeContext {
  return toolContextStorage.getStore() ?? {}
}
