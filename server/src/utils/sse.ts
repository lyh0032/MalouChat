import type { Response } from 'express'

function flushSseResponse(res: Response): void {
  const flush = (res as Response & { flush?: () => void }).flush

  if (typeof flush === 'function') {
    flush.call(res)
  }
}

export function setupSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

export function writeSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  flushSseResponse(res)
}

export function startSseHeartbeat(res: Response, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': ping\n\n')
      flushSseResponse(res)
    }
  }, intervalMs)

  timer.unref()
  return () => clearInterval(timer)
}

export function closeSse(res: Response): void {
  res.write('event: done\n')
  res.write('data: {}\n\n')
  res.end()
}
