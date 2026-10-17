import { describe, expect, it } from 'vitest'
import { createBreakdownDrafts, mergeBreakdownResults } from '../hooks/breakdown-suggestion-core'
import { makeBulkCreateResponse } from '../test-support/chat-fixtures'

const drafts = createBreakdownDrafts([{ title: 'Dishes' }, { title: 'Laundry' }])

describe('grouped breakdown outcomes', () => {
  it.each(['Success', 'Failed'] as const)('applies the parent %s result to every child', (status) => {
    expect(mergeBreakdownResults({}, drafts, makeBulkCreateResponse([status]), true)).toEqual({
      'proposal-0': status === 'Success' ? 'done' : 'failed',
      'proposal-1': status === 'Success' ? 'done' : 'failed',
    })
  })

  it('retains independent outcomes when grouping is off', () => {
    expect(mergeBreakdownResults({}, drafts, makeBulkCreateResponse(['Success', 'Failed']), false)).toEqual({
      'proposal-0': 'done',
      'proposal-1': 'failed',
    })
  })

  it('replaces every failed child outcome when the parent retry succeeds', () => {
    const failed = { 'proposal-0': 'failed', 'proposal-1': 'failed' } as const
    expect(mergeBreakdownResults(failed, drafts, makeBulkCreateResponse(['Success']), true)).toEqual({
      'proposal-0': 'done',
      'proposal-1': 'done',
    })
  })
})
