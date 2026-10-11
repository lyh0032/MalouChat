export function isCoarsePointerDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  return (
    window.matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches)
  )
}
