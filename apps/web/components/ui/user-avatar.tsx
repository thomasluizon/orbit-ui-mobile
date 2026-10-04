import type { CSSProperties } from 'react'
import { initialsOf } from '@orbit/shared/utils'

interface UserAvatarProps {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * Generic initials avatar disc: a violet-tinted circle showing a person's initials, used for
 * people without an uploaded picture. Decorative — the name is rendered
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
        color: 'var(--fg-1)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: size <= 32 ? 12 : size <= 44 ? 17 : size <= 56 ? 20 : 28,
        lineHeight: 1,
        ...style,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
