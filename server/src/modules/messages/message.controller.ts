import type { Request, Response } from 'express'

import {
  cancelMessageStream,
  completeClientToolResult,
  deleteMessage,
  regenerateMessage,
  streamMessage,
  subscribeMessageStream,
  updateMessage
} from './message.service'
import { sendSuccess } from '../../utils/http'
import { AppError } from '../../utils/app-error'
import { closeSse, setupSseHeaders, startSseHeartbeat, writeSseEvent } from '../../utils/sse'
import type { RegenerateMessageBody } from './message.schema'

type MessageParams = {
  conversationId: string
}

type MessageStreamParams = {
  conversationId: string
  messageId: string
}

function createConnectionSignal(req: Request, res: Response) {
  const abortController = new AbortController()

  const abort = () => {
    abortController.abort()
  }

  req.on('aborted', abort)
  res.on('close', abort)

  return abortController.signal
}

function safeWriteSseEvent(res: Response, event: string, data: unknown) {
  if (!res.writableEnded) {
    writeSseEvent(res, event, data)
  }
}

function buildStreamHandlers(res: Response) {
  return {
    onUserMessage(payload: unknown) {
      safeWriteSseEvent(res, 'user-message', payload)
    },
    onAssistantMessage(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-message', payload)
    },
    onAssistantStatus(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-status', payload)
    },
    onAssistantReasoningStart(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-reasoning-start', payload)
    },
    onAssistantReasoningDelta(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-reasoning-delta', payload)
    },
    onAssistantReasoningDone(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-reasoning-done', payload)
    },
    onAssistantDelta(delta: string) {
      safeWriteSseEvent(res, 'assistant-delta', { delta })
    },
    onAssistantDone(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-done', payload)
    },
    onAssistantCancelled(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-cancelled', payload)
    },
    onAssistantFailed(payload: unknown) {
      safeWriteSseEvent(res, 'assistant-failed', payload)
    },
    onClientToolRequest(payload: unknown) {
      safeWriteSseEvent(res, 'client-tool-request', payload)
    }
  }
}

export async function clientToolResultController(req: Request<MessageStreamParams>, res: Response) {
  const data = await completeClientToolResult(
    req.currentUser!.id,
    req.params.conversationId,
    req.params.messageId,
    req.body
  )
  sendSuccess(res, data, '客户端工具结果已接收')
}

export async function streamMessageController(req: Request<MessageParams>, res: Response) {
  setupSseHeaders(res)
  const signal = createConnectionSignal(req, res)
  const stopHeartbeat = startSseHeartbeat(res)

  try {
    await streamMessage(
      req.currentUser!.id,
      req.params.conversationId,
      req.body,
      buildStreamHandlers(res),
      signal
    )

    if (!res.writableEnded) {
      closeSse(res)
    }
  } catch (error) {
    if (signal.aborted || res.writableEnded) {
      return
    }

    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, '流式消息处理失败', 'STREAM_MESSAGE_FAILED')

    safeWriteSseEvent(res, 'error', {
      message: appError.message,
      errorCode: appError.errorCode
    })

    if (!res.writableEnded) {
      closeSse(res)
    }
  } finally {
    stopHeartbeat()
  }
}

export async function subscribeMessageStreamController(
  req: Request<MessageStreamParams>,
  res: Response
) {
  setupSseHeaders(res)
  const signal = createConnectionSignal(req, res)
  const stopHeartbeat = startSseHeartbeat(res)

  try {
    await subscribeMessageStream(
      req.currentUser!.id,
      req.params.conversationId,
      req.params.messageId,
      buildStreamHandlers(res),
      signal
    )

    if (!res.writableEnded) {
      closeSse(res)
    }
  } catch (error) {
    if (signal.aborted || res.writableEnded) {
      return
    }

    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, '恢复流式消息失败', 'RESUME_STREAM_MESSAGE_FAILED')

    safeWriteSseEvent(res, 'error', {
      message: appError.message,
      errorCode: appError.errorCode
    })

    if (!res.writableEnded) {
      closeSse(res)
    }
  } finally {
    stopHeartbeat()
  }
}

export async function cancelMessageStreamController(
  req: Request<MessageStreamParams>,
  res: Response
) {
  const assistantMessage = await cancelMessageStream(
    req.currentUser!.id,
    req.params.conversationId,
    req.params.messageId
  )

  sendSuccess(
    res,
    {
      assistantMessage,
      conversationId: req.params.conversationId
    },
    '停止生成成功'
  )
}

export async function updateMessageController(
  req: Request<{ conversationId: string; messageId: string }>,
  res: Response
) {
  const message = await updateMessage(
    req.currentUser!.id,
    req.params.conversationId,
    req.params.messageId,
    req.body
  )
  sendSuccess(res, message, '消息编辑成功')
}

export async function deleteMessageController(
  req: Request<{ conversationId: string; messageId: string }>,
  res: Response
) {
  await deleteMessage(
    req.currentUser!.id,
    req.params.conversationId,
    req.params.messageId
  )
  sendSuccess(res, null, '消息删除成功')
}

export async function regenerateMessageController(
  req: Request<{ conversationId: string; messageId: string }, unknown, RegenerateMessageBody>,
  res: Response
) {
  setupSseHeaders(res)
  const signal = createConnectionSignal(req, res)
  const stopHeartbeat = startSseHeartbeat(res)

  try {
    await regenerateMessage(
      req.currentUser!.id,
      req.params.conversationId,
      req.params.messageId,
      req.body,
      buildStreamHandlers(res),
      signal
    )

    if (!res.writableEnded) {
      closeSse(res)
    }
  } catch (error) {
    if (signal.aborted || res.writableEnded) {
      return
    }

    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, '重新生成失败', 'REGENERATE_MESSAGE_FAILED')

    safeWriteSseEvent(res, 'error', {
      message: appError.message,
      errorCode: appError.errorCode
    })

    if (!res.writableEnded) {
      closeSse(res)
    }
  } finally {
    stopHeartbeat()
  }
}
