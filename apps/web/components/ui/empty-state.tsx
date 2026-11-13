'use client'

import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'

/** A single-action invitation for an empty region. */
export function EmptyState({
  title,
  action,
  disclosure,
  mascotState = 'parado',
}: Readonly<EmptyStateProps>) {
  const mascotSize = useStateMascotSize()
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center" data-empty-state>
      <span className="text-[var(--fg-1)]" data-empty-state-mark>
        <OrbitMascot size={mascotSize} state={mascotState} />
      </span>
      <p
        className="text-xl font-medium text-balance text-[var(--fg-1)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {title}
      </p>
      {action ? <div data-empty-state-action>{action}</div> : null}
      {disclosure}
    </div>
  )
}
