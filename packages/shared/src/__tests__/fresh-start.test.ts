import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  FRESH_START_DELETED_ITEM_KEYS,
  FRESH_START_PRESERVED_ITEM_KEYS,
} from '../utils/fresh-start'

describe('fresh-start utils', () => {
  it('names review and permanent data deletion in both locales', () => {
    expect(en.profile.freshStart.reviewDeletion).toBe('Review deletion')
    expect(ptBR.profile.freshStart.reviewDeletion).toBe('Revisar')
    expect(en.profile.freshStart.deleteData).toBe('Delete data')
    expect(ptBR.profile.freshStart.deleteData).toBe('Apagar dados')
  })
  it('keeps the deleted and preserved key lists stable', () => {
    expect(FRESH_START_DELETED_ITEM_KEYS).toHaveLength(7)
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
