export type ToastHandler = {
  error: (content: string) => void
  success: (content: string) => void
  info: (content: string) => void
  warning: (content: string) => void
}

let activeHandler: ToastHandler | null = null

export function setToastHandler(handler: ToastHandler | null) {
  activeHandler = handler
}

export const toast: ToastHandler = {
  error(content) {
    if (activeHandler) activeHandler.error(content)
    else console.error(content)
  },
  success(content) {
    if (activeHandler) activeHandler.success(content)
  },
  info(content) {
    if (activeHandler) activeHandler.info(content)
  },
  warning(content) {
    if (activeHandler) activeHandler.warning(content)
    else console.warn(content)
  }
}
