import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { toast } from 'sonner'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { useVersionGateStore } from '@/stores/version-gate-store'

const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  getAccountGeneration: () => account.generation,
  useAuthStore: { getState: () => ({ recoverSessionRefreshFailure: vi.fn(async () => {}) }) },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'errors.api.accountChanged') return en.errors.api.accountChanged
    if (key === 'errors.api.appUpdated') return en.errors.api.appUpdated
    if (key === 'errors.api.reload') return en.errors.api.reload
    return key
  },
}))

const reloadMock = vi.fn()

describe('client account intent', () => {
  beforeEach(() => {
    setAccountEventOrigin(null)
    account.id = 'account-a'
    account.generation = 1
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.dismiss).mockClear()
    reloadMock.mockReset()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    Object.defineProperty(globalThis, 'location', {
      value: { ...globalThis.location, reload: reloadMock },
      writable: true,
      configurable: true,
    })
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

    expect(toast.error).toHaveBeenCalledWith(en.errors.api.accountChanged, expect.objectContaining({
      id: 'account-changed',
      duration: Infinity,
      action: expect.objectContaining({ label: en.errors.api.reload }),
    }))
  })

  it('keeps account-changed guidance visible after its toast is dismissed', () => {
    render(createElement(UpdateAvailableBanner))
    act(() => reportAccountChanged())
    toast.dismiss('account-changed')

    expect(screen.getByText(en.errors.api.accountChanged)).toBeInTheDocument()
    expect(screen.queryByLabelText('common.dismiss')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.errors.api.reload }))
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('shows account-changed guidance after the version banner was dismissed', () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    render(createElement(UpdateAvailableBanner))
    fireEvent.click(screen.getByLabelText('common.dismiss'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => reportAccountChanged())
    expect(screen.getByText(en.errors.api.accountChanged)).toBeInTheDocument()
  })

  it('reports only account refusals from fire-and-forget actions', () => {
    reportAccountChangedIfNeeded(new Error('network'))
    expect(toast.error).not.toHaveBeenCalled()

    reportAccountChangedIfNeeded({ code: 'ACCOUNT_CHANGED' })
    expect(toast.error).toHaveBeenCalledWith(en.errors.api.accountChanged, expect.any(Object))
  })

  it('reports and stops an account refusal before callers can apply success state', async () => {
    await expect(applyServerActionFailure({
      ok: false, error: 'Account changed', status: 409,
      code: 'ACCOUNT_CHANGED', sessionRefreshFailed: false,
    })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(toast.error).toHaveBeenCalledWith(en.errors.api.accountChanged, expect.any(Object))
  })

  it('offers a reload when the current server does not recognize the action', async () => {
    const action = runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
    const onUnexpectedRejection = vi.fn()
    void action.catch(onUnexpectedRejection)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(toast.error).toHaveBeenCalledWith(en.errors.api.appUpdated, expect.objectContaining({
      id: 'app-updated',
      duration: Infinity,
      action: expect.objectContaining({ label: en.errors.api.reload, onClick: expect.any(Function) }),
    }))
    expect(onUnexpectedRejection).not.toHaveBeenCalled()
  })

  it('keeps app-updated guidance visible after its toast is dismissed', async () => {
    render(createElement(UpdateAvailableBanner))
    const action = runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
    const onUnexpectedRejection = vi.fn()
    void action.catch(onUnexpectedRejection)

    expect(await screen.findByText(en.errors.api.appUpdated)).toBeInTheDocument()
    toast.dismiss('app-updated')
    expect(screen.getByText(en.errors.api.appUpdated)).toBeInTheDocument()
    expect(screen.queryByLabelText('common.dismiss')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.errors.api.reload }))
    expect(reloadMock).toHaveBeenCalledOnce()
    expect(onUnexpectedRejection).not.toHaveBeenCalled()
  })

  it('leaves network failures for the existing connection error path', async () => {
    const networkError = new TypeError('Failed to fetch')
    await expect(runServerAction(Promise.reject(networkError))).rejects.toBe(networkError)
    expect(toast.error).not.toHaveBeenCalled()
  })
})
