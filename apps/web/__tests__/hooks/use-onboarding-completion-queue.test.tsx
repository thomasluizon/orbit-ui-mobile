import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { completeOnboardingOrQueue, useOnboardingCompletionQueue } from '@/hooks/use-onboarding-completion-queue'

const mocks = vi.hoisted(() => ({ complete: vi.fn(), online: false, showError: vi.fn(), translate: (key: string) => key }))
vi.mock('@/lib/actions/profile', () => ({ completeOnboarding: mocks.complete }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }))
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); vi.stubGlobal('fetch', vi.fn()); holdAccount('account-1')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  mocks.online = false; mocks.complete.mockResolvedValue(undefined)
})
function mount() {
  const client = new QueryClient()
  client.setQueryData(profileKeys.detail(), createMockProfile({ hasCompletedOnboarding: false }))
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useOnboardingCompletionQueue(), { wrapper }) }
}
describe('offline onboarding completion', () => {
  it('persists offline completion and flushes it to the held account after reconnecting', async () => {
    const { result, rerender, client } = mount()
    await act(async () => { await completeOnboardingOrQueue('account-1') })
    expect(result.current).toBe(true)
    expect(mocks.complete).not.toHaveBeenCalled()
    mocks.online = true; rerender()
    await waitFor(() => expect(result.current).toBe(false))
    expect(mocks.complete).toHaveBeenCalledWith('account-1')
    expect(client.getQueryData(profileKeys.detail())).toMatchObject({ hasCompletedOnboarding: true })
    expect(localStorage.getItem('orbit_onboarding_completion_pending:account-1')).toBeNull()
  })
  it('keeps a failed queued completion available for the next reconnect', async () => {
    await completeOnboardingOrQueue('account-1')
    mocks.online = true; mocks.complete.mockRejectedValueOnce(new Error('network'))
    const { result } = mount()
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith('onboarding.flow.completionFailed'))
    expect(result.current).toBe(true)
    expect(localStorage.getItem('orbit_onboarding_completion_pending:account-1')).toBe('1')
  })
  it('does not patch another account or remove the previous flag after replacement', async () => {
    await completeOnboardingOrQueue('account-1')
    let release!: () => void
    mocks.complete.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    mocks.online = true
    const { client } = mount()
    await act(async () => { await replaceAccountWith('account-2'); release() })
    expect(client.getQueryData(profileKeys.detail())).not.toMatchObject({ hasCompletedOnboarding: true })
    expect(localStorage.getItem('orbit_onboarding_completion_pending:account-1')).toBe('1')
    expect(localStorage.getItem('orbit_onboarding_completion_pending:account-2')).toBeNull()
  })
})
