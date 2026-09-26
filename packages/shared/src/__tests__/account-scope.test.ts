import { describe, expect, it, vi } from 'vitest'
import { createAccountScope } from '../stores/account-scope'

describe('createAccountScope', () => {
  it('starts with no account and reports the account it was given', () => {
    const scope = createAccountScope()
    expect(scope.get()).toBeNull()
    scope.set('account-a')
    expect(scope.get()).toBe('account-a')
  })

  it('notifies listeners only when the account changes', () => {
    const scope = createAccountScope()
    const listener = vi.fn()
    scope.subscribe(listener)
    scope.set('account-a')
    scope.set('account-a')
    scope.set(null)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const scope = createAccountScope()
    const listener = vi.fn()
    const unsubscribe = scope.subscribe(listener)
    unsubscribe()
    scope.set('account-b')
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps each scope independent', () => {
    const first = createAccountScope()
    const second = createAccountScope()
    first.set('account-a')
    expect(second.get()).toBeNull()
  })
})
