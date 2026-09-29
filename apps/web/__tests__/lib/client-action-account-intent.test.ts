import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppToastStore } from '@/stores/app-toast-store'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import en from '@orbit/shared/i18n/en.json'
import { setApiFetchTranslate } from '@/lib/api-fetch'
import {
  captureAccountIntent,
  bindAccountServerAction,
  reportAccountChanged,
  reportAccountChangedIfNeeded,
  applyServerActionFailure,
  runServerAction,
} from '@/lib/client-action'
import { setAccountEventOrigin } from '@/lib/account-event-origin'

const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  useAuthStore: { getState: () => ({ recoverSessionRefreshFailure: vi.fn(async () => {}) }) },
}))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => account.generation }))


describe('client account intent', () => {
  beforeEach(() => {
    setAccountEventOrigin(null)
    account.id = 'account-a'
    account.generation = 1
    useAppToastStore.setState({ currentToast: null, queue: [] })
    setApiFetchTranslate((key) => {
      if (key === 'errors.api.accountChanged') return en.errors.api.accountChanged
      if (key === 'errors.api.appUpdated') return en.errors.api.appUpdated
      if (key === 'errors.api.reload') return en.errors.api.reload
      return key
    })
  })

  it('sends the current stream connection with a server action', async () => {
    setAccountEventOrigin('connection-1')
    const action = vi.fn(async (_intent: string | null) => ({ ok: true as const, data: null }))
    await bindAccountServerAction(action)()
    expect(JSON.parse(action.mock.calls[0]?.[0] ?? '')).toEqual({
      accountId: 'account-a', eventOrigin: 'connection-1',
    })
  })

  it('keeps the account and generation from the action start', () => {
    const intent = captureAccountIntent()
    expect(intent.intendedAccountId).toBe('account-a')
    expect(intent.stillCurrent()).toBe(true)

    account.generation++
    expect(intent.stillCurrent()).toBe(false)
  })

  it('shows account-specific reload guidance for an account refusal', () => {
    reportAccountChanged()

    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'neutral', message: en.errors.api.accountChanged, actionLabel: en.errors.api.reload,
    })
  })

  it('reports only account refusals from fire-and-forget actions', () => {
    reportAccountChangedIfNeeded(new Error('network'))
    expect(useAppToastStore.getState().currentToast).toBeNull()

    reportAccountChangedIfNeeded({ code: 'ACCOUNT_CHANGED' })
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe(en.errors.api.accountChanged)
  })

  it('reports and stops an account refusal before callers can apply success state', async () => {
    await expect(applyServerActionFailure({
      ok: false, error: 'Account changed', status: 409,
      code: 'ACCOUNT_CHANGED', sessionRefreshFailed: false,
    })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(useAppToastStore.getState().currentToast?.toast.message).toBe(en.errors.api.accountChanged)
  })

  it('offers a reload when the current server does not recognize the action', async () => {
    const action = runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
    const onUnexpectedRejection = vi.fn()
    void action.catch(onUnexpectedRejection)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({
      kind: 'neutral', message: en.errors.api.appUpdated, actionLabel: en.errors.api.reload, onAction: expect.any(Function),
    })
    expect(onUnexpectedRejection).not.toHaveBeenCalled()
  })

  it('leaves network failures for the existing connection error path', async () => {
    const networkError = new TypeError('Failed to fetch')
    await expect(runServerAction(Promise.reject(networkError))).rejects.toBe(networkError)
    expect(useAppToastStore.getState().currentToast).toBeNull()
  })
})
