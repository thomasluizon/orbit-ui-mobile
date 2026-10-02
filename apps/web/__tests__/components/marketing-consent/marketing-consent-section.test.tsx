import { useAuthStore } from '@/stores/auth-store'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const patchProfile = vi.fn()
let profileValue: { marketingEmailConsent: boolean | null } | undefined
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileValue, patchProfile }),
}))

const updateMarketingConsent = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/actions/profile', () => ({
  updateMarketingConsent: (data: { enabled: boolean }) =>
    updateMarketingConsent(data),
}))

import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'

function renderSection(contained = false) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MarketingConsentSection contained={contained} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})

describe('MarketingConsentSection', () => {
  beforeEach(() => {
    patchProfile.mockClear()
    updateMarketingConsent.mockClear()
    updateMarketingConsent.mockResolvedValue(undefined)
    profileValue = { marketingEmailConsent: null }
  })

  afterEach(() => cleanup())

  it.each([false, true])('asks for an explicit answer when consent has never been decided with contained %s', (contained) => {
    profileValue = { marketingEmailConsent: null }
    renderSection(contained)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'profile.marketingEmails.accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'profile.marketingEmails.decline' })).toBeInTheDocument()
  })

  it('keeps the default answered presentation with its mail icon', () => {
    profileValue = { marketingEmailConsent: false }
    const { container } = renderSection()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelector('[data-slot="list-row-title"]')).not.toBeInTheDocument()
  })

  it('reflects explicit consent off', () => {
    profileValue = { marketingEmailConsent: false }
    renderSection()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects consent on when the profile opted in', () => {
    profileValue = { marketingEmailConsent: true }
    renderSection()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it.each([false, true])('opts in and optimistically patches the profile on toggle with contained %s', async (contained) => {
    profileValue = { marketingEmailConsent: false }
    renderSection(contained)

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'))
      await Promise.resolve()
    })

    expect(updateMarketingConsent).toHaveBeenCalledWith({ enabled: true })
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
  })

  it.each([false, true])('rolls the optimistic patch back when the mutation fails with contained %s', async (contained) => {
    profileValue = { marketingEmailConsent: true }
    updateMarketingConsent.mockRejectedValueOnce(new Error('network'))
    renderSection(contained)

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(patchProfile).toHaveBeenNthCalledWith(1, { marketingEmailConsent: false })
    expect(patchProfile).toHaveBeenLastCalledWith({ marketingEmailConsent: true })
  })
})
