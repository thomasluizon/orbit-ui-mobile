'use client'

import { ActionRow } from '@/components/ui/action-row'

import type { PagerProps } from '@orbit/shared/contracts/navigation'
import { PillButton } from './pill-button'

export function Pager(props: Readonly<PagerProps>) {

  return (
    <div data-index={props.index} className="flex flex-col gap-4">
      <ol aria-label={props.label} className="flex gap-1">
        {Array.from({ length: props.count }, (_, index) => (
          <li key={index} aria-current={index === props.index ? 'step' : undefined}
            data-position={index === props.index ? 'current' : index < props.index ? 'past' : 'future'}
            className="h-1 flex-1 bg-[var(--status-empty)] data-[position=current]:bg-[var(--primary)] data-[position=past]:bg-[var(--fg-3)]">
            <span className="sr-only">{index + 1}</span>
          </li>
        ))}
      </ol>
      <ActionRow>
        <PillButton variant="ghost" disabled={!props.onBack} onClick={props.onBack}>{props.backLabel}</PillButton>
        {props.forwardLabel !== undefined ? (
          <PillButton disabled={!props.onForward} onClick={props.onForward}>{props.forwardLabel}</PillButton>
        ) : props.forwardSlot}
      </ActionRow>
    </div>
  )
}
