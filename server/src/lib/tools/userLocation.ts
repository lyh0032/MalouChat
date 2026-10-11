import { z } from 'zod/v3'

import { env } from '../../config/env'
import { getToolContext } from '../tool-context'
import { createStructuredTool } from './createStructuredTool'

type AmapRegeoResponse = {
  status?: string
  info?: string
  regeocode?: {
    addressComponent?: {
      country?: string
      province?: string
      city?: string | string[]
      district?: string
    }
  }
}

type BrowserLocationResult = {
  latitude?: number
  longitude?: number
  accuracy?: number
}

const userLocationToolInputSchema = z.object({})

function normalizePart(value: unknown): string {
  if (Array.isArray(value)) {
    return normalizePart(value[0])
  }

  return typeof value === 'string' ? value.trim() : ''
}

function stripAdministrativeSuffix(value: string) {
  return value.replace(/(省|市|自治区|特别行政区|地区|盟)$/u, '')
}

function formatLocation(parts: {
  country: string
  province: string
  city: string
  district: string
}) {
  const country = parts.country || '中国'
  const province = stripAdministrativeSuffix(parts.province)
  const city = stripAdministrativeSuffix(parts.city)
  const district = parts.district
  const resolvedCity = city && city !== province ? city : ''

  return `${country}${province}${resolvedCity}${district}`
}

async function reverseGeocodeWithAmap(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
) {
  if (!env.AMAP_API_KEY) {
    return '位置服务未配置：缺少 AMAP_API_KEY。'
  }

  const url = new URL(env.AMAP_REGEOCODE_URL)
  url.searchParams.set('key', env.AMAP_API_KEY)
  url.searchParams.set('location', `${longitude},${latitude}`)
  url.searchParams.set('extensions', 'base')
  url.searchParams.set('radius', '1000')
  url.searchParams.set('roadlevel', '0')

  const response = await fetch(url, { signal })

  if (!response.ok) {
    return `位置服务暂时不可用：HTTP ${response.status}。`
  }

  const payload = (await response.json()) as AmapRegeoResponse

  if (payload.status !== '1') {
    return `位置解析失败：${payload.info || '高德逆地理编码未返回有效结果'}。`
  }

  const component = payload.regeocode?.addressComponent

  if (!component) {
    return '位置解析失败：高德逆地理编码未返回地址组件。'
  }

  const location = {
    country: normalizePart(component.country),
    province: normalizePart(component.province),
    city: normalizePart(component.city),
    district: normalizePart(component.district)
  }

  return formatLocation(location)
}

export const userLocationTool = createStructuredTool(
  async () => {
    const { requestClientTool, signal } = getToolContext()

    if (!requestClientTool) {
      return '未获取到用户浏览器定位。请让用户授权定位，或让用户直接提供所在城市/区域。'
    }

    let location: BrowserLocationResult | null = null

    try {
      location = (await requestClientTool('getBrowserLocation', {})) as BrowserLocationResult
    } catch {
      return '未获取到用户浏览器定位。请让用户授权定位，或让用户直接提供所在城市/区域。'
    }

    if (typeof location?.latitude !== 'number' || typeof location.longitude !== 'number') {
      return '未获取到有效的用户浏览器定位。请让用户授权定位，或让用户直接提供所在城市/区域。'
    }

    signal?.throwIfAborted()
    return reverseGeocodeWithAmap(location.latitude, location.longitude, signal)
  },
  {
    name: 'getUserLocationTool',
    description:
      '获取用户当前位置所在的国家、省份、城市、区县。用户询问天气、附近、周边、本地推荐、路线、位置相关服务且没有明确地点时，应先调用此工具。',
    schema: userLocationToolInputSchema
  }
)
