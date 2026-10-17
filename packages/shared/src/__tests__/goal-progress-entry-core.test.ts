import { describe, expect, it } from 'vitest'
import { createGoalProgressEntry, getGoalProgressEntryRequest, reduceGoalProgressEntry } from '../hooks/goal-progress-entry-core'

describe('goal progress entry', () => {
  it.each(['', '  ', '-1', 'abc', 'Infinity'])('rejects invalid input %j before constructing a request', value => {
    expect(getGoalProgressEntryRequest(value, 'Retain this', 12)).toEqual({ errorKey: 'goals.form.progressValueInvalid', request: null })
  })

  it.each([['0', 0], ['7.5', 7.5], ['100', 12]] as const)('accepts and caps %s as an absolute value', (value, expected) => {
    expect(getGoalProgressEntryRequest(value, '  Note  ', 12)).toEqual({ errorKey: null, request: { currentValue: expected, note: 'Note' } })
  })

  it('permits note-only changes and omits whitespace-only notes', () => {
    expect(getGoalProgressEntryRequest('3', '  ', 12)).toEqual({ errorKey: null, request: { currentValue: 3, note: undefined } })
    expect(getGoalProgressEntryRequest('3', 'Note', 12)).toEqual({ errorKey: null, request: { currentValue: 3, note: 'Note' } })
  })

  it('retains both draft fields through validation, a failed write and retry', () => {
    let draft = createGoalProgressEntry(3)
    draft = reduceGoalProgressEntry(draft, { type: 'value', value: '7.5' })
    draft = reduceGoalProgressEntry(draft, { type: 'note', note: 'Draft' })
    draft = reduceGoalProgressEntry(draft, { type: 'invalid' })
    expect(draft.focusRequest).toBe(1)
    draft = reduceGoalProgressEntry(draft, { type: 'begin' })
    expect(draft.busy).toBe(true)
    const failure = new Error('offline')
    draft = reduceGoalProgressEntry(draft, { type: 'failure', failure })
    draft = reduceGoalProgressEntry(draft, { type: 'finish' })
    expect(draft).toMatchObject({ value: '7.5', note: 'Draft', initialText: '3', busy: false, failure })
    draft = reduceGoalProgressEntry(draft, { type: 'begin' })
    expect(draft).toMatchObject({ busy: true, failure: null, value: '7.5', note: 'Draft' })
  })
})
