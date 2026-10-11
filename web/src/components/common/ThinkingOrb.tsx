import { useEffect, useRef } from 'react'
import { subscribeThinkingOrb } from '../../utils/thinking-orb-clock'

export default function ThinkingOrb({
  size = 20,
  label = 'AI 正在思考'
}: {
  size?: number
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = (frame: number) => {
      const time = reduced ? 0.8 : frame / 1000
      context.clearRect(0, 0, size, size)
      context.fillStyle = getComputedStyle(canvas).color
      for (let index = 0; index < 12; index += 1) {
        const phase = (index / 12) * Math.PI * 2 + time * 1.35
        const orbit = size * (0.245 + Math.sin(time * 2.2 + index * 0.78) * 0.055)
        context.globalAlpha = 0.4 + (Math.sin(time * 2.7 + index * 0.72) + 1) * 0.23
        context.beginPath()
        context.arc(
          size / 2 + Math.cos(phase) * orbit,
          size / 2 + Math.sin(phase) * orbit * 0.78,
          size * 0.045,
          0,
          Math.PI * 2
        )
        context.fill()
      }
      context.globalAlpha = 1
    }
    draw(performance.now())
    return reduced ? undefined : subscribeThinkingOrb(draw)
  }, [size])
  return <canvas ref={ref} className="thinking-orb" role="img" aria-label={label} />
}
