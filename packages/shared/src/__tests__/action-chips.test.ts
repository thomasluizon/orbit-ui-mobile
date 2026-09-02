import { describe, expect, it } from 'vitest'
import { makeActionResult } from '../test-support/chat-fixtures'
import { buildActionChipsModel } from '../chat/action-chips'

describe('buildActionChipsModel', () => {
  it('omits suggestions and describes visible result state', () => {
    const model = buildActionChipsModel([
      makeActionResult(),
      makeActionResult({ status: 'Suggestion' }),
      makeActionResult({ status: 'Failed', entityId: 'habit-2' }),
    ], true)

    expect(model.state).toBe('partiallyFailed')
    expect(model.rows).toHaveLength(2)
    expect(model.rows.map((row) => row.status)).toEqual(['done', 'failed'])
  })

  it('exposes navigation only for successful safe results with a target', () => {
    const model = buildActionChipsModel([
      makeActionResult(),
      makeActionResult({ type: 'DeleteHabit' }),
      makeActionResult({ entityId: null }),
    ], true)

    expect(model.rows.map((row) => row.navigation.navigable)).toEqual([true, false, false])
  })

  it('keeps unknown symbols out of the translation key and collects conflicts', () => {
    const model = buildActionChipsModel([
      makeActionResult({
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
