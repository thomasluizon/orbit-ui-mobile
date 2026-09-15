import { describe, expect, it } from 'vitest'
import { resolveActionLabelKey } from '../chat/action-labels'

describe('resolveActionLabelKey', () => {
  it('never uses a success label for a failed action', () => {
    expect(resolveActionLabelKey('CreateHabit', 'Failed', 'Morning walk')).toBe(
      'chat.action.createFailed',
    )
    expect(resolveActionLabelKey('UpdateHabit', 'Failed', 'Read')).toBe(
      'chat.action.updateFailed',
    )
    expect(resolveActionLabelKey('DeleteHabit', 'Failed', 'Water')).toBe(
      'chat.action.deleteFailed',
    )
  })

  it('uses a generic failure label when the attempted entity has no name', () => {
    expect(resolveActionLabelKey('CreateHabit', 'Failed', null)).toBe('chat.action.failed')
  })

  it('keeps successful labels unchanged', () => {
    expect(resolveActionLabelKey('CreateHabit', 'Success', 'Meditate')).toBe(
      'chat.action.created',
    )
  })
})
