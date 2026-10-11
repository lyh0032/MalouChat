export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
}

export type ApiErrorResponse = {
  success: false
  message: string
  errorCode?: string
  errors?: unknown
}
