import { act, cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { GuidedPricingSection } from '@/components/upgrade/guided-pricing-section'
import { subscriptionPlansFixtures } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/upgrade', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

const USAGE_LINE = 'You used 3 of 5 AI messages.'
const OFFLINE_LINE = 'I am offline right now.'

function PlanQuestion({ focusOnMount, isOnline }: Readonly<{ focusOnMount: boolean; isOnline: boolean }>) {
  const t = useTranslations()
  return (
    <GuidedPricingSection
      focusOnMount={focusOnMount} profile={{ isTrialActive: false, aiMessagesPeriod: 'day' }} usage={{ aiMessagesUsed: 3, aiMessagesLimit: 5 }}
      plans={subscriptionPlansFixtures.brl} isLoadingPlans={false} isPlansError={false} isOnline={isOnline} trialDaysLeft={null}
      checkoutLoading={null} checkoutError="" discountedAmount={(amount) => amount} onCheckout={vi.fn()} onStayFree={vi.fn()} onRetryPlans={vi.fn()} t={t}
    />
  )
}
const plan = (focusOnMount: boolean, isOnline = true) => <NextIntlClientProvider locale="en" messages={en}><PlanQuestion focusOnMount={focusOnMount} isOnline={isOnline} /></NextIntlClientProvider>
const wait = () => act(() => { vi.advanceTimersByTime(1000) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the Orbit line of the plan question is read once', () => {
  it('leaves the line to the question that takes focus, then announces each later line', () => {
    const view = render(plan(true))
    const question = screen.getByRole('heading', { level: 1 })
    expect(question).toHaveFocus()
    expect(question).toHaveAccessibleDescription(USAGE_LINE)
    expect(document.querySelector('[data-upgrade-orbit-line]')).toHaveClass('text-base', 'leading-[1.4]')
    wait()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    view.rerender(plan(true, false))
    wait()
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_LINE)
    view.rerender(plan(true))
    wait()
    expect(screen.getByRole('status')).toHaveTextContent(USAGE_LINE)
  })

  it('announces the line when the question does not take focus', () => {
    render(plan(false))
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
    wait()
    expect(screen.getByRole('status')).toHaveTextContent(USAGE_LINE)
  })
})
