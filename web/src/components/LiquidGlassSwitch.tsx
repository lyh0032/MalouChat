import type { ComponentType, CSSProperties } from 'react'

import './LiquidGlassSwitch.css'

export type LiquidGlassSwitchOption<T extends string> = {
  value: T
  label: string
  icon?: ComponentType
  ariaLabel?: string
}

type LiquidGlassSwitchProps<T extends string> = {
  value: T
  options: Array<LiquidGlassSwitchOption<T>>
  onChange: (value: T) => void
  ariaLabel?: string
  size?: 'sm' | 'md'
  hideLabelsOnMobile?: boolean
  className?: string
}

export default function LiquidGlassSwitch<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = '选项切换',
  size = 'md',
  hideLabelsOnMobile = false,
  className = ''
}: LiquidGlassSwitchProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const switchStyle = {
    '--liquid-count': Math.max(options.length, 1),
    '--liquid-index': selectedIndex
  } as CSSProperties

  return (
    <div
      className={`liquid-glass-switch liquid-glass-switch--${size}${hideLabelsOnMobile ? ' liquid-glass-switch--hide-mobile-labels' : ''}${className ? ` ${className}` : ''}`}
      style={switchStyle}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      <span className="liquid-glass-switch__thumb" aria-hidden="true" />
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value

        return (
          <button
            key={option.value}
            className={`liquid-glass-switch__item${active ? ' liquid-glass-switch__item--active' : ''}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel ?? option.label}
            onClick={() => active || onChange(option.value)}
          >
            {Icon ? <Icon /> : null}
            <span className="liquid-glass-switch__label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
