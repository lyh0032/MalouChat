import { useEffect, useRef } from 'react'

import './AnimatedBackground.css'

const PARTICLE_COUNT = 300
const LINK_DISTANCE = 100
const REPULSE_RADIUS = 120
const ANNIHILATE_RADIUS = 30
const GRID_SIZE = LINK_DISTANCE
const MAX_FRAGMENTS = 700

type Particle = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  hue: number
  lightness: number
  phase: number
  alive: boolean
  respawnAt: number
  cellX: number
  cellY: number
}

type Fragment = Omit<Particle, 'id' | 'phase' | 'alive' | 'respawnAt' | 'cellX' | 'cellY'> & {
  life: number
  decay: number
}

type Sprite = { canvas: HTMLCanvasElement; size: number }

const palettes = {
  light: {
    background: ['#f3f7fb', '#eaf2ff'],
    blue: 'rgba(58,123,200,.16)',
    warm: 'rgba(140,92,42,.1)',
    grid: 'rgba(18,52,88,.055)',
    line: '58,123,200',
    lineAlpha: 0.14,
    particleAlpha: 0.7
  },
  dark: {
    background: ['#080b18', '#10182a'],
    blue: 'rgba(90,139,201,.14)',
    warm: 'rgba(201,154,90,.1)',
    grid: 'rgba(90,139,201,.045)',
    line: '90,139,201',
    lineAlpha: 0.15,
    particleAlpha: 0.74
  }
} as const

function random(min: number, max: number) {
  return Math.random() * (max - min) + min
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvasElement = canvasRef.current
    if (!canvasElement) return
    const canvasContext = canvasElement.getContext('2d')
    if (!canvasContext) return
    const canvas: HTMLCanvasElement = canvasElement
    const context: CanvasRenderingContext2D = canvasContext

    let width = 0
    let height = 0
    let ratio = 1
    let columns = 1
    let rows = 1
    let animationId = 0
    let lastFrame = 0
    let reducedMotion = false
    let pageVisible = !document.hidden
    let backgroundCanvas: HTMLCanvasElement | null = null
    let backgroundTheme = ''
    let particles: Particle[] = []
    let activeParticles: Particle[] = []
    let fragments: Fragment[] = []
    let cells: Particle[][] = []
    const sprites = new Map<string, Sprite>()
    const mouse = { x: -9999, y: -9999, active: false }
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function themeName() {
      return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    }

    function color(hue: number, lightness: number, alpha?: number) {
      return alpha == null
        ? `hsl(${Math.round(hue)},82%,${Math.round(lightness)}%)`
        : `hsla(${Math.round(hue)},82%,${Math.round(lightness)}%,${alpha})`
    }

    function spawnPosition(mixed = false) {
      if (!mixed || Math.random() > 0.58) return { x: random(0, width), y: random(0, height) }
      const side = Math.floor(random(0, 4))
      if (side === 0) return { x: random(0, width), y: -32 }
      if (side === 1) return { x: width + 32, y: random(0, height) }
      if (side === 2) return { x: random(0, width), y: height + 32 }
      return { x: -32, y: random(0, height) }
    }

    function createParticle(id: number, mixed = false): Particle {
      const hue = Math.random() < 0.88 ? random(204, 214) : random(36, 42)
      const point = spawnPosition(mixed)
      return {
        id,
        ...point,
        vx: random(-0.2, 0.2),
        vy: random(-0.2, 0.2),
        radius: random(2, 6),
        hue,
        lightness: hue < 80 ? random(48, 58) : random(50, 64),
        phase: random(0, Math.PI * 2),
        alive: true,
        respawnAt: 0,
        cellX: 0,
        cellY: 0
      }
    }

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      ratio = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.15 : 1.3)
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      columns = Math.max(1, Math.ceil(width / GRID_SIZE))
      rows = Math.max(1, Math.ceil(height / GRID_SIZE))
      cells = Array.from({ length: columns * rows }, () => [])
      particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => createParticle(index))
      fragments = []
      backgroundCanvas = null
      backgroundTheme = ''
      sprites.clear()
    }

    function spriteFor(particle: Pick<Particle, 'hue' | 'lightness' | 'radius'>) {
      const hue = Math.round(particle.hue / 8) * 8
      const lightness = Math.round(particle.lightness / 4) * 4
      const radius = Math.round(particle.radius * 2) / 2
      const key = `${hue}-${lightness}-${radius}`
      const cached = sprites.get(key)
      if (cached) return cached
      const glowRadius = radius * 4.2
      const size = Math.ceil(glowRadius * 2 + 4)
      const sprite = document.createElement('canvas')
      sprite.width = size * 2
      sprite.height = size * 2
      const ctx = sprite.getContext('2d')!
      ctx.scale(2, 2)
      const center = size / 2
      const glow = ctx.createRadialGradient(center, center, 0, center, center, glowRadius)
      glow.addColorStop(0, color(hue, lightness, 0.64))
      glow.addColorStop(0.42, color(hue, lightness, 0.18))
      glow.addColorStop(1, color(hue, lightness, 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(center, center, glowRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color(hue, lightness)
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fill()
      const result = { canvas: sprite, size }
      sprites.set(key, result)
      return result
    }

    function rebuildBackground(theme: 'light' | 'dark') {
      const palette = palettes[theme]
      const next = document.createElement('canvas')
      next.width = canvas.width
      next.height = canvas.height
      const ctx = next.getContext('2d')!
      ctx.scale(ratio, ratio)
      const base = ctx.createLinearGradient(0, 0, width, height)
      base.addColorStop(0, palette.background[0])
      base.addColorStop(1, palette.background[1])
      ctx.fillStyle = base
      ctx.fillRect(0, 0, width, height)
      const blue = ctx.createRadialGradient(
        width * 0.18,
        height * 0.16,
        0,
        width * 0.18,
        height * 0.16,
        Math.max(width, height) * 0.58
      )
      blue.addColorStop(0, palette.blue)
      blue.addColorStop(1, 'rgba(58,123,200,0)')
      ctx.fillStyle = blue
      ctx.fillRect(0, 0, width, height)
      const warm = ctx.createRadialGradient(
        width * 0.82,
        height * 0.76,
        0,
        width * 0.82,
        height * 0.76,
        Math.max(width, height) * 0.52
      )
      warm.addColorStop(0, palette.warm)
      warm.addColorStop(1, 'rgba(140,92,42,0)')
      ctx.fillStyle = warm
      ctx.fillRect(0, 0, width, height)
      ctx.beginPath()
      for (let x = 0; x < width; x += 56) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let y = 0; y < height; y += 56) {
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.strokeStyle = palette.grid
      ctx.lineWidth = 1
      ctx.stroke()
      backgroundCanvas = next
      backgroundTheme = theme
    }

    function explode(particle: Particle, dx: number, dy: number, distance: number, now: number) {
      const angle = distance > 0.001 ? Math.atan2(dy, dx) : random(0, Math.PI * 2)
      const count = Math.floor(random(3, 6))
      for (let index = 0; index < count; index += 1) {
        const direction = angle + random(-0.95, 0.95)
        const speed = random(1.45, 3.6)
        fragments.push({
          x: particle.x,
          y: particle.y,
          vx: Math.cos(direction) * speed,
          vy: Math.sin(direction) * speed,
          radius: Math.max(0.7, particle.radius * random(0.24, 0.42)),
          hue: particle.hue,
          lightness: Math.min(72, particle.lightness + random(4, 10)),
          life: 1,
          decay: random(0.025, 0.04)
        })
      }
      if (fragments.length > MAX_FRAGMENTS) fragments.splice(0, fragments.length - MAX_FRAGMENTS)
      particle.alive = false
      particle.respawnAt = now + random(1000, 2000)
    }

    function updateParticle(particle: Particle, now: number, step: number) {
      if (!particle.alive) {
        if (now >= particle.respawnAt) Object.assign(particle, createParticle(particle.id, true))
        return
      }
      if (mouse.active) {
        const dx = particle.x - mouse.x
        const dy = particle.y - mouse.y
        const distanceSq = dx * dx + dy * dy
        if (distanceSq <= ANNIHILATE_RADIUS * ANNIHILATE_RADIUS) {
          explode(particle, dx, dy, Math.sqrt(distanceSq), now)
          return
        }
        if (distanceSq < REPULSE_RADIUS * REPULSE_RADIUS) {
          const distance = Math.sqrt(distanceSq) || 0.001
          const strength = (REPULSE_RADIUS - distance) / REPULSE_RADIUS
          const force = strength * strength * 0.68
          particle.vx += (dx / distance) * force
          particle.vy += (dy / distance) * force
        }
      }
      const wander = reducedMotion ? 0.004 : 0.028
      particle.phase += 0.012 * step
      particle.vx += ((Math.random() - 0.5) * wander + Math.cos(particle.phase) * 0.004) * step
      particle.vy +=
        ((Math.random() - 0.5) * wander + Math.sin(particle.phase * 0.9) * 0.004) * step
      const friction = mouse.active ? 0.986 : 0.972
      particle.vx *= friction
      particle.vy *= friction
      const maxSpeed = mouse.active ? 4 : 1
      const speed = Math.hypot(particle.vx, particle.vy)
      if (speed > maxSpeed) {
        particle.vx = (particle.vx / speed) * maxSpeed
        particle.vy = (particle.vy / speed) * maxSpeed
      }
      particle.x += particle.vx * step
      particle.y += particle.vy * step
      const margin = particle.radius + 18
      if (particle.x < -margin) particle.x = width + margin
      if (particle.x > width + margin) particle.x = -margin
      if (particle.y < -margin) particle.y = height + margin
      if (particle.y > height + margin) particle.y = -margin
    }

    function rebuildGrid() {
      activeParticles = []
      cells.forEach((cell) => {
        cell.length = 0
      })
      particles.forEach((particle) => {
        if (!particle.alive) return
        particle.cellX = Math.max(0, Math.min(columns - 1, Math.floor(particle.x / GRID_SIZE)))
        particle.cellY = Math.max(0, Math.min(rows - 1, Math.floor(particle.y / GRID_SIZE)))
        cells[particle.cellY * columns + particle.cellX].push(particle)
        activeParticles.push(particle)
      })
    }

    function render(now: number) {
      animationId = window.requestAnimationFrame(render)
      if (!pageVisible) return
      const delta = lastFrame ? now - lastFrame : 16.67
      const step = Math.min(Math.max(delta / 16.67, 0.5), 1.8)
      lastFrame = now
      const theme = themeName()
      const palette = palettes[theme]
      if (!backgroundCanvas || backgroundTheme !== theme) rebuildBackground(theme)
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.drawImage(backgroundCanvas!, 0, 0)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      particles.forEach((particle) => updateParticle(particle, now, step))
      for (let index = fragments.length - 1; index >= 0; index -= 1) {
        const fragment = fragments[index]
        fragment.x += fragment.vx * step
        fragment.y += fragment.vy * step
        fragment.vx *= 0.955
        fragment.vy *= 0.955
        fragment.life -= fragment.decay * step
        if (fragment.life <= 0) fragments.splice(index, 1)
      }
      rebuildGrid()
      context.save()
      context.globalCompositeOperation = 'lighter'
      context.lineCap = 'round'
      for (const current of activeParticles) {
        for (
          let cy = Math.max(0, current.cellY - 1);
          cy <= Math.min(rows - 1, current.cellY + 1);
          cy += 1
        ) {
          for (
            let cx = Math.max(0, current.cellX - 1);
            cx <= Math.min(columns - 1, current.cellX + 1);
            cx += 1
          ) {
            for (const next of cells[cy * columns + cx]) {
              if (next.id <= current.id) continue
              const dx = current.x - next.x
              const dy = current.y - next.y
              const distanceSq = dx * dx + dy * dy
              if (distanceSq >= LINK_DISTANCE * LINK_DISTANCE) continue
              const alpha = (1 - Math.sqrt(distanceSq) / LINK_DISTANCE) * palette.lineAlpha
              context.strokeStyle = `rgba(${palette.line},${alpha})`
              context.lineWidth = 0.55 + alpha * 1.8
              context.beginPath()
              context.moveTo(current.x, current.y)
              context.lineTo(next.x, next.y)
              context.stroke()
            }
          }
        }
      }
      for (const particle of activeParticles) {
        const sprite = spriteFor(particle)
        context.globalAlpha = palette.particleAlpha
        context.drawImage(
          sprite.canvas,
          particle.x - sprite.size / 2,
          particle.y - sprite.size / 2,
          sprite.size,
          sprite.size
        )
      }
      for (const fragment of fragments) {
        const sprite = spriteFor(fragment)
        context.globalAlpha = Math.max(0, fragment.life) * 0.88
        context.drawImage(
          sprite.canvas,
          fragment.x - sprite.size / 2,
          fragment.y - sprite.size / 2,
          sprite.size,
          sprite.size
        )
      }
      context.restore()
      context.globalAlpha = 1
    }

    function onMouseMove(event: MouseEvent) {
      mouse.x = event.clientX
      mouse.y = event.clientY
      mouse.active = mouse.x >= 0 && mouse.x <= width && mouse.y >= 0 && mouse.y <= height
    }
    function deactivateMouse() {
      mouse.active = false
    }
    function onVisibilityChange() {
      pageVisible = !document.hidden
      lastFrame = 0
    }
    function onMotionChange() {
      reducedMotion = motionQuery.matches
    }

    onMotionChange()
    resize()
    animationId = window.requestAnimationFrame(render)
    motionQuery.addEventListener('change', onMotionChange)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('blur', deactivateMouse)
    document.addEventListener('mouseleave', deactivateMouse)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.cancelAnimationFrame(animationId)
      motionQuery.removeEventListener('change', onMotionChange)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('blur', deactivateMouse)
      document.removeEventListener('mouseleave', deactivateMouse)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return <canvas ref={canvasRef} className="animated-bg" aria-hidden="true" />
}
