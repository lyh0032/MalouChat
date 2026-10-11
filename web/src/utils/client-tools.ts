export type ClientToolRequest = {
  requestId: string
  conversationId: string
  messageId: string
  toolName: string
  params?: unknown
}

type ClientToolHandler = (params?: unknown) => Promise<unknown>

const clientToolHandlers: Record<string, ClientToolHandler> = {
  getBrowserLocation: getBrowserLocation
}

function getBrowserLocation() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return Promise.reject(new Error('浏览器定位需要在 HTTPS 或 localhost 环境下使用'))
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('当前浏览器不支持定位'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      },
      (error) => {
        reject(new Error(error.message || '浏览器定位失败'))
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000
      }
    )
  })
}

export async function executeClientTool(request: ClientToolRequest) {
  const handler = clientToolHandlers[request.toolName]

  if (!handler) {
    throw new Error(`未支持的客户端工具：${request.toolName}`)
  }

  return handler(request.params)
}
