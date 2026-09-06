import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'

const status: SubscriptionStatus = {
  plan: 'free', hasProAccess: false, isTrialActive: false, trialEndsAt: null,
  planExpiresAt: null, aiMessagesUsed: 2, aiMessagesLimit: 7, isLifetimePro: false,
  subscriptionInterval: null, source: null, lapseReason: 'payment_failed',
  subscriptionEndedAtUtc: '2026-08-01T00:00:00Z',
}
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as ReturnType<typeof useTranslations>

describe('lapsed subscription notice', () => {
  it('lists each lost entitlement separately with the current message allowance', () => {
    render(<SubscriptionNotice status={status} locale="en" t={t} />)
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('upgrade.billing.lapsed.lostMessages:{"limit":7}')
    expect(rows[1]).toHaveTextContent('upgrade.billing.lapsed.lostCalendar')
    expect(rows[2]).toHaveTextContent('upgrade.billing.lapsed.lostRetrospective')
    expect(screen.queryByText('upgrade.billing.lapsed.features')).not.toBeInTheDocument()
  })

  it('explains a payment lapse and recovery with or without a date, withholding nonactionable reasons', () => {
    const { rerender } = render(<SubscriptionNotice status={status} locale="en" t={t} />)
    expect(screen.getByText(/^upgrade\.billing\.lapsed\.payment_failed:/)).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.lapsed.paymentFix')).toBeInTheDocument()
    rerender(<SubscriptionNotice status={{ ...status, subscriptionEndedAtUtc: null }} locale="en" t={t} />)
    expect(screen.getByText('upgrade.billing.paymentIssue.title')).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.lapsed.paymentFix')).toBeInTheDocument()
    for (const lapseReason of ['canceled', 'expired', null] as const) {
      rerender(<SubscriptionNotice status={{ ...status, lapseReason }} locale="en" t={t} />)
      expect(screen.getByText(/^upgrade\.billing\.lapsed\.ended:/)).toBeInTheDocument()
      expect(screen.queryByText('upgrade.billing.lapsed.paymentFix')).not.toBeInTheDocument()
      expect(screen.queryByText('upgrade.billing.paymentIssue.title')).not.toBeInTheDocument()
    }
  })
})
