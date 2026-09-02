import type { ReactNode } from 'react'

export type BlockFrameState = 'loading' | 'resting' | 'acting' | 'partiallyFailed' | 'stale'

export type BlockFrameItemStatus = 'done' | 'acting' | 'failed'

export type BlockFrameStatusLabels = Readonly<Record<BlockFrameItemStatus, string>>

export type BlockFrameItem = {
  readonly id: string
  readonly label: ReactNode
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
  readonly count?: ReactNode
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

export type ResolvedBlockFrameRow = Readonly<{
  item: BlockFrameItem
  frameState: BlockFrameState
  statusLabel?: string
  irreversibleLabel?: string
  proposedLabel?: string
  editLabel?: string
  onEditItem?: (itemId: string) => void
}>

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

function resolveStatusLabel(
  item: BlockFrameItem,
  frameState: BlockFrameState,
  labels: BlockFrameStatusLabels,
): string | undefined {
  const status = frameState === 'acting' ? 'acting' : item.status
  if (status == null) return undefined
  if (frameState === 'acting') return labels.acting
  return item.statusLabel ?? labels[status]
}

export function resolveBlockFrameRows(
  props: BlockFrameProps,
  labels: BlockFrameStatusLabels,
): readonly ResolvedBlockFrameRow[] {
  return props.items.map((item) => ({
    item,
    frameState: props.state,
    statusLabel: resolveStatusLabel(item, props.state, labels),
    irreversibleLabel: props.irreversibleLabel,
    proposedLabel: props.proposedLabel,
    editLabel: props.editLabel,
    onEditItem: props.onEditItem,
  }))
}
