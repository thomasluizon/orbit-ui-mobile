'use client'

import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { OrbitMark } from '@/components/ui/orbit-mark'

/** A single-action invitation for an empty region. */
export function EmptyState({
  title,
  mark = 'orbit',
  action,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center" data-mark={mark}>
      <span className="text-[var(--fg-1)]" data-empty-state-mark>
        {mark === 'astra' ? <AstraGlyph size={96} /> : <OrbitMark size={96} />}
      </span>
      <p
        className="text-xl font-medium text-[var(--fg-1)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {title}
      </p>
      {action ? <div data-empty-state-action>{action}</div> : null}
    </div>
  )
}
