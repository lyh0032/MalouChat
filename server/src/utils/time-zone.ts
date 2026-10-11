export const DEFAULT_TIME_ZONE = 'Asia/Shanghai'

export function resolveTimeZone(timeZone?: string): string {
  const candidate = timeZone?.trim()

  if (!candidate) {
    return DEFAULT_TIME_ZONE
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0)
    return candidate
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

export function formatDateTimeInTimeZone(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}
