export const SPEECH_STYLE_IDS = [
  'default',
  'professional',
  'friendly',
  'direct',
  'imaginative',
  'efficient',
  'roast'
] as const

export type SpeechStyleId = (typeof SPEECH_STYLE_IDS)[number]

export type SpeechStyleInfo = {
  id: SpeechStyleId
  name: string
  prompt: string
}

export const SPEECH_STYLES: SpeechStyleInfo[] = [
  {
    id: 'default',
    name: '默认',
    prompt: ''
  },
  {
    id: 'professional',
    name: '专业可靠',
    prompt: '语气保持专业、稳健、可信，先给结论，再给必要依据；避免夸张表达。'
  },
  {
    id: 'friendly',
    name: '亲和友善',
    prompt: '语气温和、有耐心，适度照顾用户感受；表达清楚但不要过度寒暄。'
  },
  {
    id: 'direct',
    name: '直言不讳',
    prompt: '表达直接坦率，明确指出关键问题和取舍；保持尊重，不要刻薄。'
  },
  {
    id: 'imaginative',
    name: '天马行空',
    prompt: '在不牺牲准确性的前提下，表达更有想象力，允许提供更发散的视角和类比。'
  },
  {
    id: 'efficient',
    name: '高效务实',
    prompt: '优先给可执行步骤和最短路径，减少铺垫；需要时用简洁列表组织。'
  },
  {
    id: 'roast',
    name: '吐槽达人',
    prompt: '可以轻微幽默吐槽，但不要冒犯用户或人身攻击；吐槽只能作为点缀，答案仍要有用。'
  }
]

export function getSpeechStyleById(id?: string | null): SpeechStyleInfo {
  return SPEECH_STYLES.find((style) => style.id === id) ?? SPEECH_STYLES[0]
}

export function isSpeechStyleId(id: string): id is SpeechStyleId {
  return SPEECH_STYLE_IDS.includes(id as SpeechStyleId)
}

export function buildSpeechStylePrompt(id?: string | null): string {
  const style = getSpeechStyleById(id)

  if (!style.prompt) {
    return ''
  }

  return `用户选择的回答风格是「${style.name}」。请轻量遵循：${style.prompt}`
}
