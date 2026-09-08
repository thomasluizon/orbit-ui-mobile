import type { ReactNode } from 'react'
import type {
  BlockFrameItem,
  BlockFrameProps,
  ProposedProps,
} from './index'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }
type ExpectedBlockFrameItem = {
  readonly id: string
  readonly label: ReactNode
  readonly meta?: string
  readonly status?: 'done' | 'acting' | 'failed'
  readonly statusLabel?: string
  readonly control?: ReactNode
  readonly proposed?: boolean
  readonly irreversible?: boolean
}

type StaleEditedVariant = Extract<
  BlockFrameProps,
  { state: 'stale'; onEditItem: (itemId: string) => void }
>
type StalePlainVariant = Extract<BlockFrameProps, { state: 'stale'; onEditItem?: never }>
type SettledVariant = Exclude<BlockFrameProps, { state: 'stale' }>
type SettledEditedVariant = Extract<SettledVariant, { onEditItem: (itemId: string) => void }>
type SettledPlainVariant = Extract<SettledVariant, { onEditItem?: never }>
type ExpectedCommon = {
  readonly title: string
  readonly count?: ReactNode
  readonly items: readonly ExpectedBlockFrameItem[]
  readonly risk?: ReactNode
  readonly actions?: ReactNode
  readonly irreversibleLabel?: string
  readonly confirmNote?: string
  readonly proposedLabel?: string
}
type ExpectedStale = {
  readonly state: 'stale'
  readonly staleMessage: string
  readonly onRefresh: () => void
}
type ExpectedSettled = {
  readonly state: 'loading' | 'resting' | 'acting' | 'partiallyFailed'
  readonly staleMessage?: never
  readonly onRefresh?: never
}
type ExpectedEdited = {
  readonly onEditItem: (itemId: string) => void
  readonly editLabel: string
}
type ExpectedPlain = {
  readonly onEditItem?: never
  readonly editLabel?: never
}

export type BlockContractWidthAssertions = [
  Assert<IsExactWidth<Fields<StaleEditedVariant>, Fields<ExpectedCommon & ExpectedStale & ExpectedEdited>>>,
  Assert<IsExactWidth<Fields<StalePlainVariant>, Fields<ExpectedCommon & ExpectedStale & ExpectedPlain>>>,
  Assert<IsExactWidth<Fields<SettledEditedVariant>, Fields<ExpectedCommon & ExpectedSettled & ExpectedEdited>>>,
  Assert<IsExactWidth<Fields<SettledPlainVariant>, Fields<ExpectedCommon & ExpectedSettled & ExpectedPlain>>>,
  Assert<IsExactWidth<BlockFrameItem['id'], string>>,
  Assert<IsExactWidth<BlockFrameItem['label'], ReactNode>>,
  Assert<IsExactWidth<BlockFrameItem['meta'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameItem['status'], 'done' | 'acting' | 'failed' | undefined>>,
  Assert<IsExactWidth<BlockFrameItem['statusLabel'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameItem['control'], ReactNode>>,
  Assert<IsExactWidth<BlockFrameItem['proposed'], boolean | undefined>>,
  Assert<IsExactWidth<BlockFrameItem['irreversible'], boolean | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['title'], string>>,
  Assert<IsExactWidth<BlockFrameProps['count'], ReactNode>>,
  Assert<IsExactWidth<BlockFrameProps['items'], readonly ExpectedBlockFrameItem[]>>,
  Assert<IsExactWidth<BlockFrameProps['risk'], ReactNode>>,
  Assert<IsExactWidth<BlockFrameProps['actions'], ReactNode>>,
  Assert<IsExactWidth<BlockFrameProps['irreversibleLabel'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['confirmNote'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['proposedLabel'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['state'], 'loading' | 'resting' | 'acting' | 'partiallyFailed' | 'stale'>>,
  Assert<IsExactWidth<BlockFrameProps['staleMessage'], string | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['onRefresh'], (() => void) | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['onEditItem'], ((itemId: string) => void) | undefined>>,
  Assert<IsExactWidth<BlockFrameProps['editLabel'], string | undefined>>,
  Assert<IsExactWidth<ProposedProps['proposed'], boolean>>,
  Assert<IsExactWidth<ProposedProps['scope'], 'field' | 'row' | 'block'>>,
  Assert<IsExactWidth<ProposedProps['label'], string>>,
  Assert<IsExactWidth<ProposedProps['children'], ReactNode>>,
]

const items = [{ id: 'one', label: 'One' }] as const

const restingFrame: BlockFrameProps = { state: 'resting', title: 'Frame', items }
const staleFrame: BlockFrameProps = {
  state: 'stale',
  title: 'Frame',
  items,
  staleMessage: 'Moved',
  onRefresh: () => undefined,
}
const editableFrame: BlockFrameProps = {
  state: 'resting',
  title: 'Frame',
  items,
  onEditItem: () => undefined,
  editLabel: 'Edit',
}
const partiallyFailedFrame: BlockFrameProps = {
  state: 'partiallyFailed',
  title: 'Frame',
  items: [{ id: 'done', label: 'Done', status: 'done' }, { id: 'failed', label: 'Failed', status: 'failed' }],
}
const proposed: ProposedProps = {
  proposed: true,
  scope: 'row',
  label: 'Proposed',
  children: 'Child',
}

void restingFrame
void staleFrame
void editableFrame
void partiallyFailedFrame
void proposed

// @ts-expect-error stale requires staleMessage
const staleWithoutMessage: BlockFrameProps = {
  state: 'stale', title: 'Frame', items, onRefresh: () => undefined,
}
// @ts-expect-error non-stale states reject staleMessage
const restingWithStaleMessage: BlockFrameProps = {
  state: 'resting', title: 'Frame', items, staleMessage: 'Moved',
}
// @ts-expect-error error is not a BlockFrame state
const errorFrame: BlockFrameProps = { state: 'error', title: 'Frame', items }
// @ts-expect-error onEditItem requires editLabel
const editWithoutLabel: BlockFrameProps = {
  state: 'resting', title: 'Frame', items, onEditItem: () => undefined,
}
// @ts-expect-error editLabel requires onEditItem
const labelWithoutEdit: BlockFrameProps = {
  state: 'resting', title: 'Frame', items, editLabel: 'Edit',
}
// @ts-expect-error item status is a closed union
const unknownStatus: BlockFrameItem = { id: 'one', label: 'One', status: 'pending' }
// @ts-expect-error item styling is owned by BlockFrame
const itemClassName: BlockFrameItem = { id: 'one', label: 'One', className: 'custom' }
// @ts-expect-error item styling is owned by BlockFrame
const itemStyle: BlockFrameItem = { id: 'one', label: 'One', style: {} }
// @ts-expect-error rows cannot supply child markup
const itemChildren: BlockFrameItem = { id: 'one', label: 'One', children: 'Child' }
// @ts-expect-error rows cannot carry actions
const itemActions: BlockFrameItem = { id: 'one', label: 'One', actions: 'Action' }
// @ts-expect-error risk is a node slot, not a level
const frameRiskLevel: BlockFrameProps = { state: 'resting', title: 'Frame', items, riskLevel: 'high' }
// @ts-expect-error frame rows come only from items
const frameChildren: BlockFrameProps = { state: 'resting', title: 'Frame', items, children: 'Child' }
// @ts-expect-error Proposed requires an accessible label
const proposedWithoutLabel: ProposedProps = { proposed: true, scope: 'row', children: 'Child' }
// @ts-expect-error Proposed scope is closed
const proposedScope: ProposedProps = { proposed: true, scope: 'card', label: 'Proposed', children: 'Child' }
// @ts-expect-error Proposed owns its radius
const proposedRadius: ProposedProps = { proposed: true, scope: 'row', label: 'Proposed', children: 'Child', radius: 8 }
// @ts-expect-error Proposed has no tone
const proposedTone: ProposedProps = { proposed: true, scope: 'row', label: 'Proposed', children: 'Child', tone: 'quiet' }
// @ts-expect-error Proposed has no color
const proposedColor: ProposedProps = { proposed: true, scope: 'row', label: 'Proposed', children: 'Child', color: 'neutral' }
// @ts-expect-error Proposed has no accent
const proposedAccent: ProposedProps = { proposed: true, scope: 'row', label: 'Proposed', children: 'Child', accent: false }
// @ts-expect-error Proposed has no variant
const proposedVariant: ProposedProps = { proposed: true, scope: 'row', label: 'Proposed', children: 'Child', variant: 'outline' }

void staleWithoutMessage
void restingWithStaleMessage
void errorFrame
void editWithoutLabel
void labelWithoutEdit
void unknownStatus
void itemClassName
void itemStyle
void itemChildren
void itemActions
void frameRiskLevel
void frameChildren
void proposedWithoutLabel
void proposedScope
void proposedRadius
void proposedTone
void proposedColor
void proposedAccent
void proposedVariant
