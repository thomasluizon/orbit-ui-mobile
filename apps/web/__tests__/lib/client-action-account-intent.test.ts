import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import en from '@orbit/shared/i18n/en.json'
import { setApiFetchTranslate } from '@/lib/api-fetch'
import {
  captureAccountIntent,
  reportAccountChanged,
  reportAccountChangedIfNeeded,
} from '@/lib/client-action'

const account = vi.hoisted(() => ({ id: 'account-a' as string | null, generation: 1 }))

vi.mock('@/stores/auth-store', () => ({
  getHeldAccountId: () => account.id,
  getAccountGeneration: () => account.generation,
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('client account intent', () => {
  beforeEach(() => {
    account.id = 'account-a'
    account.generation = 1
    vi.mocked(toast.error).mockClear()
    setApiFetchTranslate((key) => {
      if (key === 'errors.api.accountChanged') return en.errors.api.accountChanged
      if (key === 'errors.api.reload') return en.errors.api.reload
      return key
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

  it('reports only account refusals from fire-and-forget actions', () => {
    reportAccountChangedIfNeeded(new Error('network'))
    expect(toast.error).not.toHaveBeenCalled()

    reportAccountChangedIfNeeded({ code: 'ACCOUNT_CHANGED' })
    expect(toast.error).toHaveBeenCalledWith(en.errors.api.accountChanged, expect.any(Object))
  })
})
