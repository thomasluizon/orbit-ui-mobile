import type { CSSProperties } from 'react'

interface UserAvatarProps {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Generic initials avatar disc: a violet-tinted circle showing a person's initials, used for
 * friends and feed actors where no uploaded picture exists. Decorative — the name is rendered
 * as text alongside it.
 */
export function UserAvatar({ name, size = 44, className, style }: Readonly<UserAvatarProps>) {
  return (
    <span
      aria-hidden="true"
      className={['inline-flex shrink-0 items-center justify-center rounded-full', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: size,
        height: size,
        background: 'rgba(var(--primary-rgb), 0.14)',
        color: 'var(--primary)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
        ...style,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
