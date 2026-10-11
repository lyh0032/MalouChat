import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value)

const optionalString = () => z.preprocess(emptyStringToUndefined, z.string().optional())
const optionalUrl = () => z.preprocess(emptyStringToUndefined, z.string().url().optional())
const defaultedString = (defaultValue: string) =>
  z.preprocess(emptyStringToUndefined, z.string().default(defaultValue))
const defaultedPositiveInteger = (defaultValue: number) =>
  z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive().default(defaultValue))
const defaultedUrl = (defaultValue: string) =>
  z.preprocess(emptyStringToUndefined, z.string().url().default(defaultValue))
const defaultedBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === '') return undefined
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
    }
    return value
  }, z.boolean().default(defaultValue))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5172),
  DATABASE_URL: isProduction ? z.string().min(1) : z.string().min(1).default('file:./dev.db'),
  JWT_SECRET: isProduction
    ? z.string().min(8)
    : z.string().min(8).default('dev-jwt-secret-change-me'),
  JWT_ACCESS_TOKEN_TTL_SECONDS: defaultedPositiveInteger(3600),
  JWT_REFRESH_TOKEN_TTL_SECONDS: defaultedPositiveInteger(86400),
  CORS_ORIGINS: defaultedString('http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174'),
  DASHSCOPE_API_KEY: optionalString(),
  DASHSCOPE_BASE_URL: defaultedUrl('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  DASHSCOPE_IMAGE_API_KEY: optionalString(),
  DASHSCOPE_IMAGE_GENERATION_URL: defaultedUrl(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  ),
  DASHSCOPE_WEBSEARCH_MCP_URL: defaultedUrl(
    'https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp'
  ),
  DASHSCOPE_WEBSEARCH_ENABLED: defaultedBoolean(true),
  AMAP_API_KEY: optionalString(),
  AMAP_REGEOCODE_URL: defaultedUrl('https://restapi.amap.com/v3/geocode/regeo'),
  STORAGE_BUCKET: optionalString(),
  STORAGE_ACCESS_KEY_ID: optionalString(),
  STORAGE_SECRET_ACCESS_KEY: optionalString(),
  STORAGE_ENDPOINT: optionalUrl(),
  STORAGE_DOMAIN: optionalUrl(),
  OPENAI_API_KEY: optionalString(),
  OPENAI_BASE_URL: optionalUrl()
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('Invalid environment variables', parsedEnv.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

const resolvedEnv = parsedEnv.data

export const env = {
  ...resolvedEnv,
  IMAGE_API_KEY: resolvedEnv.DASHSCOPE_IMAGE_API_KEY ?? resolvedEnv.DASHSCOPE_API_KEY ?? '',
  LLM_API_KEY: resolvedEnv.DASHSCOPE_API_KEY ?? resolvedEnv.OPENAI_API_KEY ?? '',
  LLM_BASE_URL: resolvedEnv.DASHSCOPE_API_KEY
    ? resolvedEnv.DASHSCOPE_BASE_URL
    : (resolvedEnv.OPENAI_BASE_URL ?? '')
}
