import { describe, expect, it } from 'vitest'
import type { ActionResult } from '../types/chat'
import { buildActionChipsModel } from '../chat/action-chips'

function action(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'LogHabit',
    status: 'Success',
    entityId: 'habit-1',
    entityName: 'Meditate',
    ...overrides,
  }
}

describe('buildActionChipsModel', () => {
  it('omits suggestions and describes visible result state', () => {
    const model = buildActionChipsModel([
      action(),
      action({ status: 'Suggestion' }),
      action({ status: 'Failed', entityId: 'habit-2' }),
    ], true)

    expect(model.state).toBe('partiallyFailed')
    expect(model.rows).toHaveLength(2)
    expect(model.rows.map((row) => row.status)).toEqual(['done', 'failed'])
  })

  it('exposes navigation only for successful safe results with a target', () => {
    const model = buildActionChipsModel([
      action(),
      action({ type: 'DeleteHabit' }),
      action({ entityId: null }),
    ], true)

    expect(model.rows.map((row) => row.navigation.navigable)).toEqual([true, false, false])
  })

  it('keeps unknown symbols out of the translation key and collects conflicts', () => {
    const model = buildActionChipsModel([
      action({
        type: 'UnexpectedServerSymbol',
        conflictWarning: {
          hasConflict: true,
          conflictingHabits: [],
          severity: 'LOW',
        },
      }),
    ], false)

    expect(model.rows[0]?.labelKey).toBeUndefined()
    expect(model.conflicts).toHaveLength(1)
  })
})
