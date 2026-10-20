import { describe, expect, it } from 'vitest'
import { MAX_GOAL_PROGRESS_NOTE_LENGTH } from '../validation/constants'
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

  it('accepts a note at the limit after trimming surrounding whitespace', () => {
    const note = 'a'.repeat(MAX_GOAL_PROGRESS_NOTE_LENGTH)
    expect(getGoalProgressEntryRequest('7.5', `  ${note}  `, 12)).toEqual({ errorKey: null, request: { currentValue: 7.5, note } })
  })

  it('rejects an over-limit note before constructing a request', () => {
    expect(getGoalProgressEntryRequest('7.5', 'a'.repeat(MAX_GOAL_PROGRESS_NOTE_LENGTH + 1), 12)).toEqual({ errorKey: 'goals.form.progressNoteTooLong', errorField: 'note', request: null })
  })

  it('requests focus only for the submitted invalid field', () => {
    const noteInvalid = reduceGoalProgressEntry(createGoalProgressEntry(3), { type: 'invalid', field: 'note' })
    expect(noteInvalid).toMatchObject({ focusRequest: 0, noteFocusRequest: 1 })
    const corrected = reduceGoalProgressEntry(noteInvalid, { type: 'note', note: 'Corrected' })
    expect(corrected).toMatchObject({ focusRequest: 0, noteFocusRequest: 1 })
    expect(reduceGoalProgressEntry(corrected, { type: 'invalid' })).toMatchObject({ focusRequest: 1, noteFocusRequest: 1 })
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
