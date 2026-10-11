export function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || (error as Error & { code?: string }).code === 'ABORT_ERR')
  )
}

export function throwIfAborted(signal?: AbortSignal) {
  signal?.throwIfAborted()
}

export function waitForPromiseWithAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) {
    return promise
  }

  throwIfAborted(signal)

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }

    signal.addEventListener('abort', handleAbort, { once: true })

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort)
    })
  })
}
