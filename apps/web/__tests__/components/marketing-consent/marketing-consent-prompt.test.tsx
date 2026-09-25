import { useAuthStore } from '@/stores/auth-store'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('motion/react', () => {
  const proxy = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...rest }: { children?: React.ReactNode }) =>
          React.createElement(tag, rest, children),
    },
  )
  return {
    motion: proxy,
    m: proxy,
    LazyMotion: ({ children }: { children?: React.ReactNode }) => children,
    domAnimation: {},
    domMax: {},
    useReducedMotion: () => true,
  }
})

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const patchProfile = vi.fn()
const invalidate = vi.fn()
let profileValue: { marketingEmailConsent: boolean | null } | undefined = {
  marketingEmailConsent: null,
}
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileValue, patchProfile, invalidate }),
}))

const updateMarketingConsent = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/actions/profile', () => ({
  updateMarketingConsent: (data: { enabled: boolean }) =>
    updateMarketingConsent(data),
}))

import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

function renderPrompt() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MarketingConsentPrompt />
    </QueryClientProvider>,
  )
}

function resetStores() {
  useReferralPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

async function armConsent() {
  await act(async () => {
    useReferralPromptStore
      .getState()
      .armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
    await Promise.resolve()
  })
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

beforeEach(() => {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Thomas', email: 'thomas@example.com' })
})

describe('MarketingConsentPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
    resetStores()
    patchProfile.mockClear()
    invalidate.mockClear()
    updateMarketingConsent.mockClear()
    profileValue = { marketingEmailConsent: null }
    holdAccount('user-1')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders nothing when no consent prompt is armed', () => {
    renderPrompt()
    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('does not render when a different kind is armed', async () => {
    renderPrompt()
    await act(async () => {
      useReferralPromptStore.getState().armReferralPrompt('level-3')
      await Promise.resolve()
    })
    await settle()
    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('shows after the settle delay and records markEngagementPrompted', async () => {
    renderPrompt()
    await armConsent()
    expect(screen.queryByTestId('sheet')).toBeNull()

    await settle()

    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(useReferralPromptStore.getState().promptedMilestoneKeys).toContain(
      MARKETING_CONSENT_MILESTONE_KEY,
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    renderPrompt()
    await armConsent()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('opts in and optimistically patches the profile on accept', async () => {
    renderPrompt()
    await armConsent()
    await settle()

    await act(async () => {
      fireEvent.click(screen.getByText('marketingConsent.prompt.accept'))
      await Promise.resolve()
    })

    expect(updateMarketingConsent).toHaveBeenCalledWith({ enabled: true })
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('opts out and optimistically patches the profile on decline', async () => {
    renderPrompt()
    await armConsent()
    await settle()

    await act(async () => {
      fireEvent.click(screen.getByText('marketingConsent.prompt.decline'))
      await Promise.resolve()
    })

    expect(updateMarketingConsent).toHaveBeenCalledWith({ enabled: false })
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: false })
    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('does not roll back or invalidate the next account after an old consent failure', async () => {
    let failConsent!: (error: Error) => void
    updateMarketingConsent.mockImplementationOnce(() => new Promise((_resolve, reject) => { failConsent = reject }))
    renderPrompt()
    await armConsent()
    await settle()
    await act(async () => {
      fireEvent.click(screen.getByText('marketingConsent.prompt.accept'))
      await Promise.resolve()
    })
    expect(updateMarketingConsent).toHaveBeenCalledOnce()
    expect(patchProfile).toHaveBeenCalledTimes(1)

    await replaceAccountWith('user-2')
    await act(async () => { failConsent(new Error('old account request failed')) })

    expect(patchProfile).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('takes the prompt off the screen when another account replaces the tab', async () => {
    renderPrompt()
    await armConsent()
    await settle()
    expect(screen.getByTestId('sheet')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('does not open under the next account from a timer the previous one armed', async () => {
    renderPrompt()
    await armConsent()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    await replaceAccountWith('user-2')
    await settle()

    expect(screen.queryByTestId('sheet')).toBeNull()
  })
})
