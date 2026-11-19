import { describe, expect, it, vi } from 'vitest'
import { describeDeleteAccountFlowStep, getDeleteAccountWarningKeys, type DeleteAccountFlowStepState } from '../utils/delete-account'

const now = new Date('2026-11-13T12:00:00Z')

describe('getDeleteAccountWarningKeys', () => {
  it.each([
    [{ hasProAccess: true, planExpiresAt: '2026-12-01T00:00:00Z', billingProvider: 'stripe', subscriptionSource: 'stripe' }, 'profile.deleteAccount.warningPro', null],
    [{ hasProAccess: true, planExpiresAt: '2026-11-01T00:00:00Z', billingProvider: 'stripe', subscriptionSource: 'stripe' }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: true, planExpiresAt: null, billingProvider: null, subscriptionSource: null }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: false, planExpiresAt: null, billingProvider: null, subscriptionSource: null }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: true, planExpiresAt: '2026-12-01T00:00:00Z', billingProvider: 'app_store', subscriptionSource: null }, 'profile.deleteAccount.warningPro', 'profile.deleteAccount.warningAppStore'],
  ] as const)('names the warning for the plan %#', (profile, plan, store) => {
    expect(getDeleteAccountWarningKeys(profile, now)).toEqual({ plan, store })
  })

  it('names the free warning before the profile loads', () => {
    expect(getDeleteAccountWarningKeys(undefined, now)).toEqual({ plan: 'profile.deleteAccount.warningFree', store: null })
  })
})

describe('delete account flow step frame', () => {
  const translate = (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)
  const state = (change: Partial<DeleteAccountFlowStepState> = {}): DeleteAccountFlowStepState => ({
    step: 'send', email: 'ana@example.com', offline: false, loading: false, canSend: true,
    onContinue: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), onSend: vi.fn(), ...change,
  })

  it('opens on the warning with no way back, and continues to the code request', () => {
    const warning = state({ step: 'warning' })
    const frame = describeDeleteAccountFlowStep(warning, translate)
    expect(frame).toMatchObject({ position: 1, direction: -1, question: 'profile.deleteAccount.headingAreYouSure', line: null, onBack: undefined, onDismiss: warning.onClose })
    frame.primary?.onPress()
    expect(warning.onContinue).toHaveBeenCalledTimes(1)
  })

  it('names the address the code goes to, and states no address it does not know', () => {
    expect(describeDeleteAccountFlowStep(state(), translate).line).toBe('profile.deleteAccount.sendLine {"email":"ana@example.com"}')
    expect(describeDeleteAccountFlowStep(state({ email: null }), translate).line).toBeNull()
  })

  it('sends the code request one time, and sends nothing while a request runs or before the send is allowed', () => {
    const ready = state()
    describeDeleteAccountFlowStep(ready, translate).primary?.onPress()
    expect(ready.onSend).toHaveBeenCalledTimes(1)
    const running = state({ loading: true })
    const frame = describeDeleteAccountFlowStep(running, translate)
    frame.primary?.onPress()
    expect(running.onSend).not.toHaveBeenCalled()
    expect(frame.onBack, 'no way back while the request runs').toBeUndefined()
    expect(frame.onDismiss).toBe(running.onClose)
    const blocked = state({ canSend: false })
    describeDeleteAccountFlowStep(blocked, translate).primary?.onPress()
    expect(blocked.onSend).not.toHaveBeenCalled()
  })

  it('goes back to the warning from the code request, and shows no main action offline', () => {
    const idle = state()
    expect(describeDeleteAccountFlowStep(idle, translate)).toMatchObject({ position: 2, direction: 1, onBack: idle.onBack, onDismiss: idle.onBack })
    expect(describeDeleteAccountFlowStep(state({ offline: true }), translate).primary).toBeUndefined()
    expect(describeDeleteAccountFlowStep(state({ step: 'warning', offline: true }), translate).primary).toBeUndefined()
  })
})
