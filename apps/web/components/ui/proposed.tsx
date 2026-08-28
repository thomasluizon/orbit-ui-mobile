import type { ProposedProps } from '@orbit/shared/contracts/blocks'
import { PROPOSED_RADIUS } from '@orbit/shared/contracts/blocks'

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
