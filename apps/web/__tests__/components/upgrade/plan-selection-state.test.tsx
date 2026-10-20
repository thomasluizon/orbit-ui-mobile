import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { subscriptionPlansFixture } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'

const motionPreference = vi.hoisted(() => ({ reduced: false }))

vi.mock('motion/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => motionPreference.reduced,
}))

function Selection({ loading }: Readonly<{ loading: boolean }>) {
  const t = useTranslations()
  return <PlanSelection
    plans={loading ? null : subscriptionPlansFixture}
    isLoading={loading} isError={false} isOnline
    discountedAmount={(amount) => amount}
    checkoutLoading={null} onCheckout={vi.fn()} onRetry={vi.fn()} t={t}
  />
}

describe('PlanSelection card state through presence transitions', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([false, true])('exposes only loaded card hooks, reduced motion: %s', async (reduced) => {
    motionPreference.reduced = reduced
    const selection = (loading: boolean) => <NextIntlClientProvider locale="en" messages={en}>
      <Selection loading={loading} />
    </NextIntlClientProvider>
    const view = render(selection(true))

    expect(view.container.querySelectorAll('[data-tier-reservation]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-tier], [data-tier-content]')).toHaveLength(0)
    expect(view.container.querySelectorAll('[data-tier-measurement] [data-selected]')).toHaveLength(0)

    view.rerender(selection(false))

    for (const interval of ['yearly', 'monthly']) {
      expect(view.container.querySelectorAll(`[data-tier="${interval}"]`)).toHaveLength(1)
      expect(view.container.querySelectorAll(`[data-tier-content="${interval}"]`)).toHaveLength(1)
    }
    await waitFor(() => expect(view.container.querySelectorAll('[data-tier-reservation]')).toHaveLength(0))
    expect(view.container.querySelectorAll('[data-tier]')).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: en.upgrade.plans.interval.monthly }))
    expect(view.container.querySelectorAll('[data-tier][data-selected]')).toHaveLength(1)
    expect(view.container.querySelector('[data-tier][data-selected]')).toHaveAttribute('data-tier', 'monthly')
  })
})
