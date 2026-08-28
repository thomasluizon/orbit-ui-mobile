import { describe, expect, it } from 'vitest'
import {
  findMissingBlockFrameLabels,
  PROPOSED_RADIUS,
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
})
