import type { ReactNode } from 'react'

export type BlockFrameState = 'loading' | 'resting' | 'acting' | 'stale' | 'error'

export type BlockFrameItemStatus = 'done' | 'acting' | 'failed'

export type BlockFrameItem = {
  readonly id: string
  readonly label: string
  readonly meta?: string
  readonly status?: BlockFrameItemStatus
  readonly statusLabel?: string
  readonly control?: ReactNode
  readonly proposed?: boolean
  readonly irreversible?: boolean
}

type BlockFrameStaleArm = {
  readonly state: 'stale'
  readonly staleMessage: string
  readonly onRefresh: () => void
}

type BlockFrameSettledArm = {
  readonly state: Exclude<BlockFrameState, 'stale'>
  readonly staleMessage?: never
  readonly onRefresh?: never
}

type BlockFrameItemEditArm =
  | { readonly onEditItem: (itemId: string) => void; readonly editLabel: string }
  | { readonly onEditItem?: never; readonly editLabel?: never }

type BlockFrameCommon = {
  readonly title: string
  readonly items: readonly BlockFrameItem[]
  readonly risk?: ReactNode
  readonly actions?: ReactNode
  readonly irreversibleLabel?: string
  readonly confirmNote?: string
  readonly proposedLabel?: string
}

export type BlockFrameProps = BlockFrameCommon &
  (BlockFrameStaleArm | BlockFrameSettledArm) &
  BlockFrameItemEditArm

export type MissingBlockFrameLabel =
  | 'irreversibleLabel'
  | 'confirmNote'
  | 'proposedLabel'

function isMissingLabel(label: string | undefined): boolean {
  return label == null || label.trim().length === 0
}

export function findMissingBlockFrameLabels(
  props: BlockFrameProps,
): readonly MissingBlockFrameLabel[] {
  const missingLabels: MissingBlockFrameLabel[] = []
  const hasIrreversibleItem = props.items.some((item) => item.irreversible === true)

  if (hasIrreversibleItem && isMissingLabel(props.irreversibleLabel)) {
    missingLabels.push('irreversibleLabel')
  }
  if (hasIrreversibleItem && isMissingLabel(props.confirmNote)) {
    missingLabels.push('confirmNote')
  }
  if (props.items.some((item) => item.proposed === true) && isMissingLabel(props.proposedLabel)) {
    missingLabels.push('proposedLabel')
  }

  return missingLabels
}
