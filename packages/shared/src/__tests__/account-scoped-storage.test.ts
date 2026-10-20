import { describe, expect, it } from 'vitest'
import {
  buildAccountScopedStorageKey,
  readAccountScopedFlag,
} from '../utils/account-scoped-storage'

describe('buildAccountScopedStorageKey', () => {
  it('puts the account in the key so two accounts never share one entry', () => {
    expect(buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')).not.toBe(
      buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-2'),
    )
  })
})

describe('readAccountScopedFlag', () => {
  it('reports the flag for the account that carries it', () => {
    expect(readAccountScopedFlag('1', null)).toEqual({ seen: true, adoptsLegacy: false })
  })

  it('gives the pre-rename flag to the account signed in now, once', () => {
    expect(readAccountScopedFlag(null, '1')).toEqual({ seen: true, adoptsLegacy: true })
  })

  it('prefers the account entry over the pre-rename one', () => {
    expect(readAccountScopedFlag('1', '1')).toEqual({ seen: true, adoptsLegacy: false })
  })

  it('reports nothing seen for an account with neither entry', () => {
    expect(readAccountScopedFlag(null, null)).toEqual({ seen: false, adoptsLegacy: false })
  })
})
