import type { CSSProperties, ReactNode } from 'react'
import { AstraGlyph } from '@/components/ui/astra-glyph'

interface AstraMarkAdapterProps {
  size?: string | number
  color?: string
}

/** @deprecated Use AstraGlyph directly outside legacy Tabler icon slots. */
export function AstraMark({ size = 24, color }: Readonly<AstraMarkAdapterProps>) {
  return <AstraGlyph size={typeof size === 'number' ? size : Number(size)} color={color} />
}

interface AstraAvatarProps {
  size?: number
  label?: string
  className?: string
  style?: CSSProperties
}

export function AstraAvatar({
  size = 116,
  label,
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
      <AstraGlyph size={Math.round(size * 0.5)} color="var(--primary)" />
    </span>
  )
}
