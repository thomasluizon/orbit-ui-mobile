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

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    title,
  }: {
    open: boolean
    children?: React.ReactNode
    title?: string
    onOpenChange?: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="consent-prompt">
        {title}
        {children}
      </div>
    ) : null,
}))

const patchProfile = vi.fn()
const invalidate = vi.fn()
let profileValue: { marketingEmailConsent: boolean | null } | undefined = {
  marketingEmailConsent: null,
}
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileValue, patchProfile, invalidate }),
}))

const updateMarketingConsent = vi.fn().mockResolvedValue(undefined)
vi.mock('@/app/actions/profile', () => ({
  updateMarketingConsent: (data: { enabled: boolean }) =>
    updateMarketingConsent(data),
}))

import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'

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

describe('MarketingConsentPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
    patchProfile.mockClear()
    updateMarketingConsent.mockClear()
    profileValue = { marketingEmailConsent: null }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders nothing when no consent prompt is armed', () => {
    renderPrompt()
    expect(screen.queryByTestId('consent-prompt')).toBeNull()
  })

  it('does not render when a different kind is armed', async () => {
    renderPrompt()
    await act(async () => {
      useReferralPromptStore.getState().armReferralPrompt('level-3')
      await Promise.resolve()
    })
    await settle()
    expect(screen.queryByTestId('consent-prompt')).toBeNull()
  })

  it('shows after the settle delay and records markEngagementPrompted', async () => {
    renderPrompt()
    await armConsent()
    expect(screen.queryByTestId('consent-prompt')).toBeNull()

    await settle()

    expect(screen.getByTestId('consent-prompt')).toBeInTheDocument()
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

    expect(screen.queryByTestId('consent-prompt')).toBeNull()
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
    expect(screen.queryByTestId('consent-prompt')).toBeNull()
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
    expect(screen.queryByTestId('consent-prompt')).toBeNull()
  })
})
