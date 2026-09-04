import { describe, expect, it } from 'vitest'
import { makeActionResult } from '../test-support/chat-fixtures'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { ACTION_LABEL_KEYS, buildActionChipsModel } from '../chat/action-chips'

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

  it('uses a non-success label for every failed action type', () => {
    for (const [type, keys] of Object.entries(ACTION_LABEL_KEYS)) {
      const model = buildActionChipsModel([
        makeActionResult({ type, status: 'Failed', entityName: 'Named attempt' }),
      ], false)

      expect(model.rows[0]?.labelKey).toBe(keys.failed)
      expect(model.rows[0]?.labelKey).not.toBe(keys.success)
    }
  })

  it('uses generic failure labels for nameless and unknown failed actions', () => {
    const model = buildActionChipsModel([
      makeActionResult({ type: 'create_habit', status: 'Failed', entityName: null }),
      makeActionResult({ type: 'UnexpectedServerSymbol', status: 'Failed', entityName: 'Named attempt' }),
    ], false)

    expect(model.rows.map((row) => row.labelKey)).toEqual([
      'chat.action.failed',
      'chat.action.failedNamed',
    ])
  })

  it('keeps successful rows byte-identical', () => {
    const model = buildActionChipsModel([makeActionResult()], true)

    expect(model.rows[0]).toEqual({
      id: 'action-habit-1-0',
      labelKey: 'chat.action.logged',
      entityName: 'Meditate',
      status: 'done',
      navigation: {
        navigable: true,
        entityId: 'habit-1',
        actionType: 'LogHabit',
      },
    })
  })

  it('keeps three failed attempts distinguishable by name', () => {
    const entityNames = ['Morning walk', 'Read ten pages', 'Drink water']
    const model = buildActionChipsModel(entityNames.map((entityName) => makeActionResult({
      type: 'create_habit',
      status: 'Failed',
      entityId: null,
      entityName,
    })), false)

    expect(model.rows.map((row) => row.entityName)).toEqual(entityNames)
  })

  it('provides equivalent failed create wording in both locales', () => {
    expect(en.chat.action.createFailed.replace('{name}', 'Morning walk')).toBe(
      'Could not create Morning walk',
    )
    expect(ptBR.chat.action.createFailed.replace('{name}', 'Caminhada matinal')).toBe(
      'Não foi possível criar Caminhada matinal',
    )
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
