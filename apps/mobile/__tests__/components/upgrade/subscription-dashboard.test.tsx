import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import en from '@orbit/shared/i18n/en.json'
import { createTokensV2 } from '@/lib/theme'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PitchSubscriptionCard } from '@/components/upgrade/pitch-subscription-card'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import type { UpgradeTextFn } from '@/components/upgrade/types'

vi.mock('@/components/upgrade/plan-summary-card', () => ({
  PlanSummaryCard: (props: Record<string, unknown>) =>
    React.createElement('PlanSummaryCard', props),
}))

vi.mock('@/components/upgrade/usage-card', () => ({
  UsageCard: (props: Record<string, unknown>) => React.createElement('UsageCard', props),
}))

vi.mock('@/hooks/use-subscription-plans', () => ({
  formatPrice: (amount: number, currency: string) =>
    `${currency} ${(amount / 100).toFixed(2)}`,
}))

vi.mock('@/lib/plural', () => ({
  plural: (value: string) => value,
}))

const TestRenderer = require('react-test-renderer')

type RenderedTree = {
  root: {
    findByType: (type: string) => { props: Record<string, unknown> }
  }
  toJSON: () => unknown
}

const t: UpgradeTextFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const tokens = createTokensV2('purple', 'dark')
const status: SubscriptionStatus = {
  plan: 'pro',
  hasProAccess: true,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: '2026-09-28T00:00:00Z',
  aiMessagesUsed: 8,
  aiMessagesLimit: 50,
  isLifetimePro: false,
  subscriptionInterval: 'yearly',
  source: 'stripe',
  lapseReason: null,
  subscriptionEndedAtUtc: null,
}
const billing: BillingDetails = {
  status: 'active',
  currentPeriodEnd: '2026-09-28T00:00:00Z',
  cancelAtPeriodEnd: false,
  interval: 'monthly',
  amountPerPeriod: 777,
  currency: 'usd',
  paymentMethod: null,
  recentInvoices: [],
}

function render(element: React.ReactElement) {
  let tree: RenderedTree | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree!
}

describe('subscription dashboards (mobile)', () => {
  it('labels the Stripe amount as the monthly plan price instead of the catalog price', () => {
    const tree = render(
      <BillingDashboard
        state="stripe"
        data={billing}
        isOnline
        locale="en"
        usagePercent={16}
        usageProfile={{ aiMessagesUsed: 8, aiMessagesLimit: 50 }}
        status={status}
        onPortal={() => {}}
        onRetryPortal={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    const summary = tree.root.findByType('PlanSummaryCard')
    expect(summary.props.planLabel).toBe('upgrade.billing.plan.monthly')
    expect(summary.props.meta).toContain(
      'upgrade.billing.plan.monthlyPrice:{"price":"usd 7.77"}',
    )
    expect(en.upgrade.billing.plan.monthlyPrice).toBe('Monthly plan price: {price}')
  })

  it('shows Play pricing only when a confirmed Play display price is available', () => {
    const playStatus = { ...status, source: 'play' as const }
    const withoutPrice = render(
      <PlayBillingDashboard
        status={playStatus}
        locale="en"
        usagePercent={16}
        usageProfile={{ aiMessagesUsed: 8, aiMessagesLimit: 50 }}
        portalState="idle"
        isOnline
        onManagePlay={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(withoutPrice.root.findByType('PlanSummaryCard').props.meta).not.toContain(
      'upgrade.billing.plan.yearlyPrice',
    )

    const withPrice = render(
      <PlayBillingDashboard
        status={playStatus}
        displayPrice="R$ 99,90"
        locale="en"
        usagePercent={16}
        usageProfile={{ aiMessagesUsed: 8, aiMessagesLimit: 50 }}
        portalState="idle"
        isOnline
        onManagePlay={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(withPrice.root.findByType('PlanSummaryCard').props.meta).toContain(
      'upgrade.billing.plan.yearlyPrice:{"price":"R$ 99,90"}',
    )
  })

  it('renders the real trial countdown and a neutral null-interval label', () => {
    const pricing = render(
      <PricingSection
        profile={{ isTrialActive: true }}
        plans={null}
        isLoadingPlans={false}
        isPlansError={false}
        isOnline
        trialDaysLeft={5}
        selectedInterval="yearly"
        onSelectInterval={() => {}}
        onStayFree={() => {}}
        yearlyOffer={null}
        isReferralPricing={false}
        isRestoring={false}
        onRestore={() => {}}
        onRetryPlans={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(JSON.stringify(pricing.toJSON())).toContain(
      'upgrade.convert.trialDaysLeft:{\\"days\\":5}',
    )

    const trialCard = render(
      <PitchSubscriptionCard
        status={{
          ...status,
          isTrialActive: true,
          trialEndsAt: '2026-09-02T00:00:00Z',
          subscriptionInterval: null,
        }}
        locale="en"
        t={t}
        tokens={tokens}
      />,
    )
    const cardText = JSON.stringify(trialCard.toJSON())
    expect(cardText).toContain('upgrade.billing.plan.pro')
    expect(cardText).not.toContain('upgrade.billing.plan.monthly')
  })
})
