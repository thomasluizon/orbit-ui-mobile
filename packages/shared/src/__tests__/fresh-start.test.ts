import { describe, expect, it } from 'vitest'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  FRESH_START_DELETED_ITEM_KEYS,
  FRESH_START_PRESERVED_ITEM_KEYS,
} from '../utils/fresh-start'

describe('fresh-start utils', () => {
  it('keeps the deleted and preserved key lists stable', () => {
    expect(FRESH_START_DELETED_ITEM_KEYS).toHaveLength(8)
    expect(FRESH_START_PRESERVED_ITEM_KEYS).toEqual([
      'profile.freshStart.preserveAccount',
      'profile.freshStart.preserveSubscription',
      'profile.freshStart.preservePreferences',
    ])
  })

  it('builds translated deleted and preserved item lists', () => {
    const translate = (key: string) => `t:${key}`

    expect(buildFreshStartDeletedItems(translate)[0]).toBe(
      't:profile.freshStart.deleteHabits',
    )
    expect(buildFreshStartPreservedItems(translate)).toEqual([
      't:profile.freshStart.preserveAccount',
      't:profile.freshStart.preserveSubscription',
      't:profile.freshStart.preservePreferences',
    ])
  })
})
