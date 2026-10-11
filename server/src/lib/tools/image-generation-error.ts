export class ImageGenerationProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerCode?: string
  ) {
    super(message)
    this.name = 'ImageGenerationProviderError'
  }
}

function isRateLimitError(error: ImageGenerationProviderError) {
  const details = `${error.providerCode ?? ''} ${error.message}`.toLowerCase()

  return (
    error.status === 429 ||
    /rate[\s_-]*limit|too many requests|throttl|ratequota|请求频繁|限流/u.test(details)
  )
}

export function getFriendlyImageGenerationError(error: unknown) {
  if (error instanceof ImageGenerationProviderError) {
    if (isRateLimitError(error)) {
      return '图片生成请求较多，请稍等 10～30 秒后重试，本次没有生成图片。'
    }

    if (error.status === 401 || error.status === 403) {
      return '图片生成服务暂时不可用，请联系管理员检查服务配置。'
    }

    if (error.status && error.status >= 500) {
      return '图片生成服务暂时繁忙，请稍后重试。'
    }
  }

  return '图片生成暂时失败，请稍后重试。'
}
