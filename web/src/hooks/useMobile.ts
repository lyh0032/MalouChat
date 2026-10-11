import { useSyncExternalStore } from 'react'

export function useMobile(breakpoint = 960) {
  const query = `(max-width: ${breakpoint}px)`

  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onStoreChange)
      return () => mediaQuery.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
