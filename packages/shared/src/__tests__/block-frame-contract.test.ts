import { describe, expect, it } from 'vitest'
import {
  findMissingBlockFrameLabels,
  PROPOSED_RADIUS,
  resolveBlockFrameRows,
  resolveBlockFrameState,
  type BlockFrameProps,
} from '../contracts/blocks'

type RuntimeLabels = Partial<Pick<
  BlockFrameProps,
  'irreversibleLabel' | 'confirmNote' | 'proposedLabel'
>>

function frame(items: BlockFrameProps['items'], labels: RuntimeLabels = {}): BlockFrameProps {
  return { state: 'resting', title: 'Frame', items, ...labels }
}

describe('block frame contract', () => {
  it('guards actions with missing consequence labels and stale state on both platforms', () => {
    const unsafe = frame([{ id: 'one', label: 'One', irreversible: true }])
    expect(resolveBlockFrameState(unsafe)).toEqual({ missingLabels: ['irreversibleLabel', 'confirmNote'], hasIrreversibleItem: true, canRenderActions: false })
    expect(resolveBlockFrameState({ ...unsafe, irreversibleLabel: 'Permanent', confirmNote: 'Confirm' })).toMatchObject({ canRenderActions: true })
    expect(resolveBlockFrameState({ state: 'stale', title: 'Frame', items: [], staleMessage: 'Stale' })).toMatchObject({ hasIrreversibleItem: false, canRenderActions: false })
    expect(resolveBlockFrameState(frame([]))).toMatchObject({ missingLabels: [], canRenderActions: true })
  })
  it('requires no labels for reversible plain items', () => {
    expect(findMissingBlockFrameLabels(frame([
      { id: 'one', label: 'One' },
      { id: 'two', label: 'Two' },
      { id: 'three', label: 'Three' },
    ]))).toEqual([])
  })

  it('requires both consequence labels for an irreversible item', () => {
    expect(findMissingBlockFrameLabels(frame([
      { id: 'one', label: 'One', irreversible: true },
    ]))).toEqual(['irreversibleLabel', 'confirmNote'])
  })

  it('returns only the missing consequence label', () => {
    expect(findMissingBlockFrameLabels(frame(
      [{ id: 'one', label: 'One', irreversible: true }],
      { irreversibleLabel: 'Permanent' },
    ))).toEqual(['confirmNote'])
  })

  it('requires a proposed label for a suggested item', () => {
    expect(findMissingBlockFrameLabels(frame([
      { id: 'one', label: 'One', proposed: true },
    ]))).toEqual(['proposedLabel'])
  })

  it('returns all three labels for a proposed irreversible item', () => {
    expect(findMissingBlockFrameLabels(frame([
      { id: 'one', label: 'One', proposed: true, irreversible: true },
    ]))).toEqual(['irreversibleLabel', 'confirmNote', 'proposedLabel'])
  })

  it('fixes the radius for each proposed scope', () => {
    expect(PROPOSED_RADIUS).toEqual({ field: 12, row: 8, block: 20 })
    expect(Object.keys(PROPOSED_RADIUS)).toHaveLength(3)
  })

  it('resolves platform-independent row props and status labels once', () => {
    const onEditItem = () => undefined
    const resting: BlockFrameProps = {
      state: 'resting',
      title: 'Frame',
      items: [
        { id: 'saved', label: 'Saved', status: 'done', statusLabel: 'Saved override' },
        { id: 'failed', label: 'Failed', status: 'failed' },
      ],
      onEditItem,
      editLabel: 'Edit',
    }
    const labels = { done: 'Done', acting: 'In progress', failed: 'Failed' }

    const restingRows = resolveBlockFrameRows(resting, labels)
    const actingRows = resolveBlockFrameRows({ ...resting, state: 'acting' }, labels)

    expect(restingRows.map((row) => row.statusLabel)).toEqual(['Saved override', 'Failed'])
    expect(actingRows.map((row) => row.statusLabel)).toEqual(['In progress', 'In progress'])
    expect(restingRows[0]).toMatchObject({
      frameState: 'resting',
      editLabel: 'Edit',
      onEditItem,
    })
  })
})
