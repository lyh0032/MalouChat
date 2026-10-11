const CHAT_ROUTE_NAMES = new Set(['chat', 'project-chat', 'project-conversation'])

let lastChatRoute = '/chat'

export function isChatRouteName(routeName: unknown) {
  return typeof routeName === 'string' && CHAT_ROUTE_NAMES.has(routeName)
}

export function rememberChatRoute(fullPath: string) {
  lastChatRoute = fullPath
}

export function getLastChatRoute() {
  return lastChatRoute
}
