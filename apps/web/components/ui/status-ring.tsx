'use client'

import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { Check } from '@/components/ui/icons'

const STATUS_COLOR: Record<NonNullable<StatusRingProps['status']>, string> = {
  empty: 'var(--fg-4)',
  done: 'var(--fg-1)',
  overdue: 'var(--status-overdue)',
  bad: 'var(--status-bad)',
}

export function StatusRing({
  status = 'empty',
  size = 30,
  label,
}: Readonly<StatusRingProps>) {
  const done = status === 'done'
  const color = STATUS_COLOR[status]
  const checkSize = Math.round(size * 0.57)

  return (
    <span
      role="img"
      aria-label={label}
      data-status={status}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: done ? color : 'transparent',
        boxShadow: done ? 'none' : `inset 0 0 0 2px ${color}`,
      }}
    >
      {done ? (
        <Check
          aria-hidden="true"
          size={checkSize}
          strokeWidth={3}
          color="var(--bg)"
        />
      ) : null}
    </span>
  )
}
