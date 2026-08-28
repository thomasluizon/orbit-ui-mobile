import type { BlockFrameItem, BlockFrameProps, ProposedProps } from './index'

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
