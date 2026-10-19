import { beforeEach, describe, expect, it } from 'vitest'
import { createStepUpSessionState, type StepUpSessionState } from '../utils/step-up-session'

const ACCOUNT = 'user-1'
let session: StepUpSessionState

describe('account-bound step up session', () => {
  beforeEach(() => {
    session = createStepUpSessionState()
  })

  it('holds a verified result in memory for the session', () => {
    expect(session.isStepUpVerified('keys')).toBe(false)

    session.markStepUpVerified('keys')

    expect(session.isStepUpVerified('keys')).toBe(true)
    expect(session.isStepUpVerified('keys')).toBe(true)
  })

  it('consumes the create grant without hiding key management', () => {
    session.markStepUpVerified('keys')

    session.consumeApiKeyCreationGrant()

    expect(session.hasApiKeyCreationGrant()).toBe(false)
    expect(session.isStepUpVerified('keys')).toBe(true)
  })

  it('clears visibility, the create grant and the expiry draft when the account changes', () => {
    session.bindStepUpStateToAccount('account-a')
    session.markStepUpVerified('keys')
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')

    session.bindStepUpStateToAccount('account-b')

    expect(session.isStepUpVerified('keys')).toBe(false)
    expect(session.hasApiKeyCreationGrant()).toBe(false)
    expect(session.readApiKeyExpiryDraft()).toBe('')
    session.bindStepUpStateToAccount('account-a')
    expect(session.readApiKeyExpiryDraft()).toBe('')
  })

  it('keeps the expiry through grant renewal for the same account', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')
    session.consumeApiKeyCreationGrant()
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')

    expect(session.readApiKeyExpiryDraft()).toBe('2099-12-31T23:59')
  })

  it('forgets expiry drafts on sign out and ignores typing without an account', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')
    session.clearStepUpState()
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')

    expect(session.readApiKeyExpiryDraft()).toBe('')
  })

  it('keeps independently created sessions isolated', () => {
    const otherSession = createStepUpSessionState()
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')

    expect(otherSession.isStepUpVerified('keys')).toBe(false)
    expect(otherSession.hasApiKeyCreationGrant()).toBe(false)
    expect(otherSession.readApiKeyExpiryDraft()).toBe('')
  })

  it('clears the creation grant without hiding management or discarding expiry', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')
    session.clearApiKeyCreationGrant()

    expect(session.hasApiKeyCreationGrant()).toBe(false)
    expect(session.isStepUpVerified('keys')).toBe(true)
    expect(session.readApiKeyExpiryDraft()).toBe('2099-12-31T23:59')
  })

  it('restores permission and expiry together after verification, then clears only pending permission', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.rememberApiKeyCreationPermission(true)
    session.retainApiKeyExpiryDraft('2099-12-31T23:59')
    expect(session.readPendingApiKeyPermission()).toBe(false)
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(true)
    expect(session.readApiKeyExpiryDraft()).toBe('2099-12-31T23:59')
    session.clearPendingApiKeyPermission()
    expect(session.readPendingApiKeyPermission()).toBe(false)
    expect(session.hasApiKeyCreationGrant()).toBe(true)
    expect(session.readApiKeyExpiryDraft()).toBe('2099-12-31T23:59')
  })

  it('keeps permission through grant renewal only for the same account', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.rememberApiKeyCreationPermission(true)
    session.markStepUpVerified('keys')
    session.consumeApiKeyCreationGrant()
    expect(session.readPendingApiKeyPermission()).toBe(false)
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(true)
    session.clearApiKeyCreationGrant()
    expect(session.readPendingApiKeyPermission()).toBe(false)
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(true)
    session.bindStepUpStateToAccount('account-b')
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(false)
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(false)
  })

  it('forgets permission on sign out and preserves an explicit read-write choice', () => {
    session.bindStepUpStateToAccount(ACCOUNT)
    session.rememberApiKeyCreationPermission(true)
    session.clearStepUpState()
    session.bindStepUpStateToAccount(ACCOUNT)
    session.markStepUpVerified('keys')
    expect(session.readPendingApiKeyPermission()).toBe(false)
    session.rememberApiKeyCreationPermission(true)
    session.rememberApiKeyCreationPermission(false)
    expect(session.readPendingApiKeyPermission()).toBe(false)
  })
})
