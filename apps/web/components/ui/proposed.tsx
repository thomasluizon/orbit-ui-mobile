import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'

/**
 * CSS inheritance gives uncolored descendants --fg-3 and yields the same visible result as native
 * Proposed for the same children. A composite child owns the explicit token colors it sets and
 * renders unchanged. An explicit color always wins on both platforms.
 */
export function Proposed({ proposed, scope, label, children }: Readonly<ProposedProps>) {
  if (!proposed) return children

  return (
    <div
      aria-label={label}
      className="border border-dashed border-[var(--hairline-strong)] text-[var(--fg-3)]"
      data-proposed=""
      role="group"
      style={{ borderRadius: PROPOSED_RADIUS[scope] }}
    >
      {children}
    </div>
  )
}
