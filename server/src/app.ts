import cors from 'cors'
import express from 'express'

import { errorMiddleware } from './middlewares/error'
import { notFoundMiddleware } from './middlewares/notFound'
import { apiRouter } from './modules'
import { env } from './config/env'

const app = express()

app.set('etag', false)

function parseCorsOrigins(rawOrigins: string) {
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

app.use(
  cors({
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: true
  })
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'server is running'
  })
})

app.use('/api', apiRouter)
app.use(notFoundMiddleware)
app.use(errorMiddleware)

export default app
