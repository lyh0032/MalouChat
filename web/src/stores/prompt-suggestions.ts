import { create } from 'zustand'

import { EMPTY_CHAT_PROMPT_CATEGORIES, type EmptyChatPromptCategoryId } from '../constants/prompt-suggestions'

type CategoryState = { index: number; order: string[] }
type VisibleSuggestion = { id: EmptyChatPromptCategoryId; label: string; prompt: string }
type PromptState = { categoryStates: Record<EmptyChatPromptCategoryId, CategoryState>; batchKey: number; showNextBatch: () => void }

function shuffle(prompts: readonly string[], previous?: string) {
  const result = [...prompts]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  if (previous && result.length > 1 && result[0] === previous) [result[0], result[1]] = [result[1], result[0]]
  return result
}

function createStates() {
  return Object.fromEntries(EMPTY_CHAT_PROMPT_CATEGORIES.map((category) => [category.id, { index: 0, order: shuffle(category.prompts) }])) as Record<EmptyChatPromptCategoryId, CategoryState>
}

export const usePromptSuggestionsStore = create<PromptState>((set) => ({
  categoryStates: createStates(),
  batchKey: 0,
  showNextBatch() {
    set((state) => {
      const categoryStates = { ...state.categoryStates }
      EMPTY_CHAT_PROMPT_CATEGORIES.forEach((category) => {
        const current = categoryStates[category.id]
        categoryStates[category.id] = current.index + 1 < current.order.length
          ? { ...current, index: current.index + 1 }
          : { index: 0, order: shuffle(category.prompts, current.order[current.index]) }
      })
      return { categoryStates, batchKey: state.batchKey + 1 }
    })
  }
}))

export function selectVisibleSuggestions(state: Pick<PromptState, 'categoryStates'>): VisibleSuggestion[] {
  return EMPTY_CHAT_PROMPT_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    prompt: state.categoryStates[category.id].order[state.categoryStates[category.id].index]
  }))
}
