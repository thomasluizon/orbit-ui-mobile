import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildFreshStartDeletedItems, buildFreshStartPreservedItems, FRESH_START_DELETED_ITEM_KEYS, FRESH_START_PRESERVED_ITEM_KEYS, freshStartSubmitAction, isFreshStartConfirmed } from '../utils/fresh-start'

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

describe('fresh start confirmation', () => {
  it('accepts the word ORBIT in any case with outer spaces, and nothing else', () => {
    expect(isFreshStartConfirmed('ORBIT')).toBe(true)
    expect(isFreshStartConfirmed('  orbit ')).toBe(true)
    expect(isFreshStartConfirmed('ORBITS')).toBe(false)
    expect(isFreshStartConfirmed('OR BIT')).toBe(false)
    expect(isFreshStartConfirmed('')).toBe(false)
  })

  it('resets on a confirmed press, refocuses the field on a wrong word, and does nothing while the reset cannot run', () => {
    expect(freshStartSubmitAction({ confirmText: 'orbit', blocked: false })).toBe('reset')
    expect(freshStartSubmitAction({ confirmText: 'orb', blocked: false })).toBe('refocus')
    expect(freshStartSubmitAction({ confirmText: 'orbit', blocked: true })).toBe('none')
    expect(freshStartSubmitAction({ confirmText: '', blocked: true })).toBe('none')
  })
})
