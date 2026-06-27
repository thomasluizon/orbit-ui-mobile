import type { CSSProperties, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'

const RING_RADIUS = 8.25
const CORE_RADIUS = 3
const SATELLITE_RADIUS = 1.9
const SATELLITE_X = 17.83
const SATELLITE_Y = 6.17
const TRAIL_PATH = 'M9.18 4.24 A8.25 8.25 0 0 1 17.83 6.17'

interface AstraMarkProps extends LucideProps {
  /** Slowly orbit the satellite around the core. Reduced-motion is honored globally. */
  animate?: boolean
}

/**
 * Astra's identity glyph: a violet core with a single satellite tracing a hairline orbit.
 * Token-driven and `LucideProps`-compatible, so it drops into icon slots like a lucide icon.
 * Passing `color` renders it monochrome (icon contexts); omitting it keeps the violet/hairline duotone.
 */
export function AstraMark({
  size = 24,
  color,
  strokeWidth = 1.8,
  animate = false,
}: Readonly<AstraMarkProps>) {
  const dimension = typeof size === 'number' ? size : Number(size)
  const stroke = typeof strokeWidth === 'number' ? strokeWidth : Number(strokeWidth)
  const monochrome = color != null
  const ringColor = monochrome ? color : 'var(--fg-4)'
  const accentColor = monochrome ? color : 'var(--primary)'

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={animate ? 'astra-orbit' : undefined}
    >
      <circle
        cx={12}
        cy={12}
        r={RING_RADIUS}
        stroke={ringColor}
        strokeWidth={stroke}
        opacity={monochrome ? 0.45 : 1}
      />
      <path d={TRAIL_PATH} stroke={accentColor} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx={SATELLITE_X} cy={SATELLITE_Y} r={SATELLITE_RADIUS} fill={accentColor} />
      <circle cx={12} cy={12} r={CORE_RADIUS} fill={accentColor} />
    </svg>
  )
}

interface AstraAvatarProps {
  /** Disc diameter in px. */
  size?: number
  /** Accessible name. When omitted the avatar is decorative (hidden from assistive tech). */
  label?: string
  /** Slowly orbit the satellite (reduced-motion gated). */
  animate?: boolean
  className?: string
  style?: CSSProperties
}

/** Astra's avatar: the orbital mark centered on a primary-tinted disc, for hero and chat-bubble use. */
export function AstraAvatar({
  size = 116,
  label,
  animate = false,
  className,
  style,
}: Readonly<AstraAvatarProps>): ReactNode {
  const decorative = label == null

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      className={['inline-flex shrink-0 items-center justify-center rounded-full', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: size,
        height: size,
        background: 'rgba(var(--primary-rgb), 0.14)',
        ...style,
      }}
    >
      <AstraMark size={Math.round(size * 0.5)} animate={animate} />
    </span>
  )
}
