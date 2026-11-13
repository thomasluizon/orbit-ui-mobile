'use client'

import { ActionRow } from '@/components/ui/action-row'

import type { PagerProps } from '@orbit/shared/contracts/navigation'
import { PillButton } from './pill-button'

export function PagerSegments({ count, index, label }: Readonly<Pick<PagerProps, 'count' | 'index' | 'label'>>) {
  return (
    <ol aria-label={label} className="flex gap-1">
      {Array.from({ length: count }, (_, position) => (
        <li key={position} aria-current={position === index ? 'step' : undefined}
          data-position={position === index ? 'current' : position < index ? 'past' : 'future'}
          className="h-1 flex-1 bg-[var(--status-empty)] data-[position=current]:bg-[var(--primary)] data-[position=past]:bg-[var(--fg-3)]">
          <span className="sr-only">{position + 1}</span>
        </li>
      ))}
    </ol>
  )
}

export function Pager(props: Readonly<PagerProps>) {

  return (
    <div data-index={props.index} className="flex flex-col gap-4">
      <PagerSegments count={props.count} index={props.index} label={props.label} />
      <ActionRow>
        <PillButton variant="ghost" accessibleName={props.backLabel} disabled={!props.onBack} onClick={props.onBack}>{props.backLabel}</PillButton>
        {props.forwardLabel !== undefined ? (
          <PillButton accessibleName={props.forwardLabel} disabled={!props.onForward} onClick={props.onForward}>{props.forwardLabel}</PillButton>
        ) : props.forwardSlot}
      </ActionRow>
    </div>
  )
}
