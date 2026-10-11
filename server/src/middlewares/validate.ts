import type { RequestHandler } from 'express'
import type { ZodTypeAny } from 'zod'

type ValidateSchema = {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
}

export function validate(schema: ValidateSchema): RequestHandler {
  return (req, _res, next) => {
    if (schema.body) {
      req.body = schema.body.parse(req.body)
    }

    if (schema.query) {
      req.query = schema.query.parse(req.query) as typeof req.query
    }

    if (schema.params) {
      req.params = schema.params.parse(req.params) as typeof req.params
    }

    next()
  }
}
