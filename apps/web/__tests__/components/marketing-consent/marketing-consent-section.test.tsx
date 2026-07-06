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
vi.mock('@/app/actions/profile', () => ({
  updateMarketingConsent: (data: { enabled: boolean }) =>
    updateMarketingConsent(data),
}))

import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MarketingConsentSection />
    </QueryClientProvider>,
  )
}

describe('MarketingConsentSection', () => {
  beforeEach(() => {
    patchProfile.mockClear()
    updateMarketingConsent.mockClear()
    updateMarketingConsent.mockResolvedValue(undefined)
    profileValue = { marketingEmailConsent: null }
  })

  afterEach(() => cleanup())

  it('reflects consent off when the profile has not opted in', () => {
    profileValue = { marketingEmailConsent: null }
    renderSection()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects consent on when the profile opted in', () => {
    profileValue = { marketingEmailConsent: true }
    renderSection()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('opts in and optimistically patches the profile on toggle', async () => {
    profileValue = { marketingEmailConsent: false }
    renderSection()

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'))
      await Promise.resolve()
    })

    expect(updateMarketingConsent).toHaveBeenCalledWith({ enabled: true })
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
  })

  it('rolls the optimistic patch back when the mutation fails', async () => {
    profileValue = { marketingEmailConsent: true }
    updateMarketingConsent.mockRejectedValueOnce(new Error('network'))
    renderSection()

    await act(async () => {
      fireEvent.click(screen.getByRole('switch'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(patchProfile).toHaveBeenNthCalledWith(1, { marketingEmailConsent: false })
    expect(patchProfile).toHaveBeenLastCalledWith({ marketingEmailConsent: true })
  })
})
