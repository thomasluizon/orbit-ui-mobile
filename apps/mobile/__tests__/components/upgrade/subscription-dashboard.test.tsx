import React from 'react'
import { Linking, StyleSheet, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import en from '@orbit/shared/i18n/en.json'
import { createTokensV2 } from '@/lib/theme'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import type { UpgradeTextFn } from '@/components/upgrade/types'
import type { PlayOffer } from '@/hooks/use-play-billing'

vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof import('react-native')>()
  return { ...native, Linking: { openURL: vi.fn() } }
})

vi.mock('@/components/upgrade/plan-summary-card', () => ({
  PlanSummaryCard: ({ badges, ...props }: Record<string, unknown>) =>
    React.createElement('PlanSummaryCard', props, badges as React.ReactNode),
}))

vi.mock('@/components/upgrade/usage-card', () => ({
  UsageCard: (props: Record<string, unknown>) => React.createElement('UsageCard', props),
}))

vi.mock('@/hooks/use-subscription-plans', () => ({
  formatPrice: (amount: number, currency: string) =>
    `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

vi.mock('@/lib/plural', () => ({
  plural: (value: string) => value,
}))

const TestRenderer = require('react-test-renderer')

type RenderedTree = {
  root: {
    findByType: (type: string) => { props: Record<string, unknown> }
    findAll: (predicate: (node: { type: unknown; props: Record<string, unknown> }) => boolean) =>
      { type: unknown; props: Record<string, unknown> }[]
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

function renderedText(tree: RenderedTree) {
  return JSON.stringify(tree.toJSON())
}

const plans = {
  monthly: { unitAmount: 999, currency: 'brl' },
  yearly: { unitAmount: 9990, currency: 'brl' },
  savingsPercent: 17,
  couponPercentOff: null,
  currency: 'brl',
}

const yearlyReferralOffer: PlayOffer = {
  interval: 'yearly',
  sku: 'yearly-sku',
  offerToken: 'yearly-referral',
  displayPrice: '',
  isReferral: true,
  priceAmountMicros: null,
  currency: null,
}

function renderPricing(
  overrides: Partial<React.ComponentProps<typeof PricingSection>> = {},
) {
  return render(
    <PricingSection
      profile={null}
      plans={null}
      isLoadingPlans={false}
      isPlansError={false}
      isOnline
      trialDaysLeft={null}
      selectedInterval="yearly"
      onSelectInterval={() => {}}
      onStayFree={() => {}}
      monthlyOffer={null}
      yearlyOffer={null}
      checkoutLoading={null}
      checkoutError=""
      checkoutDisabled={false}
      onCheckout={() => {}}
      isRestoring={false}
      onRestore={() => {}}
      onRetryPlans={() => {}}
      t={t}
      tokens={tokens}
      {...overrides}
    />,
  )
}

describe('subscription dashboards (mobile)', () => {
  it('reports an invoice handoff failure and clears it when the hosted invoice retry succeeds', async () => {
    const openURL = vi.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(undefined)
    const url = 'https://billing.test/hosted-invoice'
    const tree = render(<BillingDashboard state="stripe" data={{ ...billing, recentInvoices: [{
      id: 'invoice-hosted', date: '2026-08-01T00:00:00Z', amountPaid: 777, currency: 'usd',
      status: 'paid', invoicePdf: null, hostedInvoiceUrl: url, billingReason: 'subscription_cycle',
    }] }} isOnline locale="en" usagePercent={16} usageProfile={status} status={status}
    onPortal={() => {}} onRetryPortal={() => {}} t={t} tokens={tokens} />)
    const download = () => tree.root.findAll((node) => node.type === 'Pressable'
      && String(node.props.accessibilityLabel).startsWith('upgrade.billing.invoices.downloadDated:'))[0]!
    try {
      await TestRenderer.act(async () => { (download().props.onPress as () => void)(); await Promise.resolve() })
      expect(openURL).toHaveBeenLastCalledWith(url)
      expect(renderedText(tree)).toContain('auth.genericError')
      await TestRenderer.act(async () => { (download().props.onPress as () => void)(); await Promise.resolve() })
      expect(openURL).toHaveBeenCalledTimes(2)
      expect(renderedText(tree)).not.toContain('auth.genericError')
    } finally {
      openURL.mockRestore()
    }
  })

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
    expect((summary.props.facts as (string | null)[]).filter(Boolean).join(' ')).toContain(
      'upgrade.billing.plan.monthlyPrice:{"price":"usd 7.77"}',
    )
    expect(en.upgrade.billing.plan.monthlyPrice).toBe('Monthly plan price: {price}')
  })

  it.each([
    [
      'yearly renewal',
      'stripe',
      { ...billing, interval: 'yearly' },
      status,
      'upgrade.billing.plan.yearly',
      'upgrade.billing.plan.renewsOn',
    ],
    [
      'cancel at period end',
      'canceled',
      { ...billing, cancelAtPeriodEnd: true },
      status,
      'upgrade.billing.plan.monthly',
      'upgrade.billing.plan.canceledHint',
    ],
    [
      'past due',
      'past-due',
      { ...billing, status: 'past_due' },
      status,
      'upgrade.billing.plan.monthly',
      'upgrade.billing.plan.renewsOn',
    ],
    [
      'lifetime',
      'lifetime',
      null,
      { ...status, isLifetimePro: true },
      'upgrade.billing.plan.lifetime',
      'upgrade.billing.plan.lifetimeHint',
    ],
  ] as const)(
    'renders the %s Stripe dashboard outcome',
    (_name, state, data, dashboardStatus, expectedLabel, expectedMeta) => {
      const tree = render(
        <BillingDashboard
          state={state}
          data={data}
          isOnline
          locale="en"
          usagePercent={16}
          usageProfile={{ aiMessagesUsed: 8, aiMessagesLimit: 50 }}
          status={dashboardStatus}
          onPortal={() => {}}
          onRetryPortal={() => {}}
          t={t}
          tokens={tokens}
        />,
      )
      const summary = tree.root.findByType('PlanSummaryCard')
      expect(summary.props.planLabel).toBe(expectedLabel)
      expect(state === 'lifetime' ? summary.props.body : (summary.props.facts as (string | null)[]).filter(Boolean).join(' ')).toContain(expectedMeta)
      if (state === 'canceled') {
        expect(renderedText(tree)).toContain('upgrade.billing.plan.canceledBadge')
      }
      if (state === 'past-due') {
        expect(renderedText(tree)).toContain('upgrade.billing.plan.pastDue')
      }
    },
  )

  it('renders payment and invoice controls only for available live handoffs', () => {
    const onPortal = vi.fn()
    const data: BillingDetails = {
      ...billing,
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expMonth: 3,
        expYear: 2029,
      },
      recentInvoices: [
        {
          id: 'invoice-paid',
          date: '2026-08-01T00:00:00Z',
          amountPaid: 777,
          currency: 'usd',
          status: 'paid',
          hostedInvoiceUrl: null,
          invoicePdf: 'https://billing.test/invoice.pdf',
          billingReason: 'subscription_cycle',
        },
        {
          id: 'invoice-open',
          date: '2026-08-02T00:00:00Z',
          amountPaid: 777,
          currency: 'usd',
          status: 'open',
          hostedInvoiceUrl: null,
          invoicePdf: null,
          billingReason: 'manual',
        },
      ],
    }
    const online = render(
      <BillingDashboard
        state="stripe"
        data={data}
        isOnline
        locale="en"
        usagePercent={81}
        usageProfile={{ aiMessagesUsed: 41, aiMessagesLimit: 50 }}
        status={status}
        onPortal={onPortal}
        onRetryPortal={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(renderedText(online)).toContain('upgrade.billing.payment.card')
    expect(renderedText(online)).toContain('upgrade.billing.invoices.reasonCycle')
    expect(renderedText(online)).toContain('upgrade.billing.invoices.statusOpen')
    const invoiceText = online.root.findAll((node) => node.type === 'Text')
      .map((node) => node.props.children).filter((text) => typeof text === 'string').join(' ')
    expect(invoiceText.match(/upgrade\.billing\.invoices\.statusPaid/g)).toHaveLength(1)
    expect(invoiceText.match(/upgrade\.billing\.invoices\.statusOpen/g)).toHaveLength(1)
    expect(online.root.findAll((node) => node.type === 'Text' && node.props.children === 'usd 7.77')).toHaveLength(2)
    expect(
      online.root.findAll((node) => node.type === 'Pressable'
        && node.props.accessibilityLabel === 'upgrade.billing.payment.change'),
    ).toHaveLength(1)
    expect(
      online.root.findAll((node) => node.type === 'Pressable'
        && String(node.props.accessibilityLabel).startsWith('upgrade.billing.invoices.downloadDated:')),
    ).toHaveLength(1)

    const offline = render(
      <BillingDashboard
        state="offline"
        data={data}
        isOnline={false}
        locale="en"
        usagePercent={81}
        usageProfile={{ aiMessagesUsed: 41, aiMessagesLimit: 50 }}
        status={status}
        onPortal={onPortal}
        onRetryPortal={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(renderedText(offline)).toContain('upgrade.billing.payment.card')
    expect(renderedText(offline)).toContain('upgrade.billing.invoices.reasonCycle')
    expect(
      offline.root.findAll((node) => node.type === 'Pressable'
        && node.props.accessibilityLabel === 'upgrade.billing.payment.change' && node.props.disabled === true),
    ).toHaveLength(1)
    expect(
      offline.root.findAll((node) => node.type === 'Pressable'
        && String(node.props.accessibilityLabel).startsWith('upgrade.billing.invoices.downloadDated:')),
    ).toHaveLength(0)
    const manageButton = offline.root.findAll(
      (node) => Boolean(node.type === 'Pressable'
        && node.props.accessibilityRole === 'button'
        && node.props.accessibilityState
        && (node.props.accessibilityState as { disabled?: boolean }).disabled === true),
    )
    expect(manageButton).toHaveLength(2)
  })

  it.each([
    ['portal-opening', 'upgrade.billing.actions.manage'],
    ['portal-failed', 'upgrade.billing.portalFailed'],
  ] as const)('renders the %s Stripe portal outcome', (state, expectedText) => {
    const tree = render(
      <BillingDashboard
        state={state}
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
    expect(renderedText(tree)).toContain(expectedText)
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
    expect((withoutPrice.root.findByType('PlanSummaryCard').props.facts as (string | null)[]).filter(Boolean).join(' ')).not.toContain(
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
    expect((withPrice.root.findByType('PlanSummaryCard').props.facts as (string | null)[]).filter(Boolean).join(' ')).toContain(
      'upgrade.billing.plan.yearlyPrice:{"price":"R$ 99,90"}',
    )
  })

  it('labels entitled Play cancellation as access ending and keeps its price and handoff', () => {
    const tree = render(<PlayBillingDashboard
      status={{ ...status, source: 'play', lapseReason: 'canceled' }} displayPrice="R$ 99,90"
      locale="en" usagePercent={16} usageProfile={status} portalState="idle" isOnline
      onManagePlay={() => {}} t={t} tokens={tokens} />)
    const summary = tree.root.findByType('PlanSummaryCard')
    expect(summary.props.body).toBe('upgrade.billing.plan.canceledBody:{"limit":50}')
    expect(summary.props.facts).toContain('upgrade.billing.plan.yearlyPrice:{"price":"R$ 99,90"}')
    expect((summary.props.facts as string[]).join(' ')).toContain('upgrade.billing.plan.canceledHint:')
    const accessEnd = new Date(status.planExpiresAt!).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    expect(summary.props.facts).toContain(`upgrade.billing.plan.canceledHint:${JSON.stringify({ date: accessEnd })}`)
    expect((summary.props.facts as string[]).join(' ')).not.toContain('upgrade.billing.plan.renewsOn')
    expect(renderedText(tree)).toContain('upgrade.billing.plan.canceledBadge')
    expect(renderedText(tree)).toContain('upgrade.billing.actions.managePlay')
    expect(tree.root.findByType('UsageCard').props.profile).toEqual(status)
  })

  it.each([
    ['monthly', 'R$ 12,90', 'upgrade.billing.plan.monthly', 'upgrade.billing.plan.monthlyPrice'],
    [null, 'R$ 12,90', 'upgrade.billing.plan.pro', ''],
  ] as const)(
    'renders the %s Play plan without substituting an interval',
    (interval, displayPrice, expectedLabel, expectedPriceKey) => {
      const tree = render(
        <PlayBillingDashboard
          status={{ ...status, source: 'play', subscriptionInterval: interval, planExpiresAt: null }}
          displayPrice={displayPrice}
          locale="en"
          usagePercent={81}
          usageProfile={{ aiMessagesUsed: 41, aiMessagesLimit: 50 }}
          portalState="idle"
          isOnline
          onManagePlay={() => {}}
          t={t}
          tokens={tokens}
        />,
      )
      const summary = tree.root.findByType('PlanSummaryCard')
      expect(summary.props.planLabel).toBe(expectedLabel)
      if (expectedPriceKey) expect((summary.props.facts as (string | null)[]).filter(Boolean).join(' ')).toContain(expectedPriceKey)
      else expect((summary.props.facts as (string | null)[]).filter(Boolean).join(' ')).toBe('')
    },
  )

  it.each([
    ['opening', true, 'upgrade.billing.actions.managePlay'],
    ['failed', true, 'upgrade.billing.portalFailed'],
    ['idle', false, 'upgrade.billing.actions.managePlay'],
  ] as const)('renders the %s Play portal outcome online=%s', (portalState, isOnline, expectedText) => {
    const tree = render(
      <PlayBillingDashboard
        status={{ ...status, source: 'play' }}
        locale="en"
        usagePercent={16}
        usageProfile={{ aiMessagesUsed: 8, aiMessagesLimit: 50 }}
        portalState={portalState}
        isOnline={isOnline}
        onManagePlay={() => {}}
        t={t}
        tokens={tokens}
      />,
    )
    expect(renderedText(tree)).toContain(expectedText)
    if (!isOnline) {
      expect(
        tree.root.findAll((node) => Boolean(node.props.accessibilityRole === 'button'
          && node.type === 'Pressable'
          && (node.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled)),
      ).toHaveLength(1)
    }
  })

  it('renders the real trial countdown', () => {
    const pricing = renderPricing({
      profile: { isTrialActive: true },
      trialDaysLeft: 5,
    })
    expect(JSON.stringify(pricing.toJSON())).toContain(
      'upgrade.convert.trialDaysLeft:{\\"days\\":5}',
    )

  })

  it('renders the arithmetic pitch and exactly three outcome rows', () => {
    const onStayFree = vi.fn()
    const tree = renderPricing({ plans, onStayFree })
    const text = renderedText(tree)

    expect(text).toContain('upgrade.convert.freeAllowance')
    expect(text).toContain('upgrade.convert.freeEyebrow')
    expect(text).toContain('upgrade.convert.proAllowance')
    expect(text).toContain('upgrade.convert.allowanceNote')
    expect(tree.root.findAll(
      (node) => node.type === 'View'
        && node.props.accessibilityLabel === 'upgrade.convert.allowanceLabel',
    )).toHaveLength(0)
    const outcomes = tree.root.findAll((node) => node.type === 'View'
      && node.props.accessibilityLabel === 'upgrade.outcomes.label')
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]?.props.accessible).toBe(true)
    expect(text).toContain('upgrade.convert.promise')
    expect(text).toContain('upgrade.convert.trustLine')
    expect(text).toContain('upgrade.convert.cancelAnytime')
    expect(text).toContain('upgrade.plans.renewalNote')
    expect(text).toContain('upgrade.convert.handOff')
    expect(text).toContain('upgrade.convert.stayFree')
    expect(
      tree.root.findAll(
        (node) => node.props.children === 'upgrade.convert.freeHeading',
      )[0]?.props.accessibilityRole,
    ).toBe('header')
    expect(tree.root.findAll(
      (node) => node.type === 'View'
        && node.props.accessibilityElementsHidden === true
        && node.props.importantForAccessibility === 'no-hide-descendants',
    )).toHaveLength(4)
    expect(tree.root.findAll(
      (node) => node.type === 'Text'
        && node.props.accessibilityRole === 'header'
        && typeof node.props.children === 'string'
        && node.props.children.startsWith('upgrade.outcomes.'),
    )).toHaveLength(3)
    const decline = tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'link',
    ).at(-1)
    expect(decline).toBeDefined()
    TestRenderer.act(() => (decline?.props.onPress as (() => void) | undefined)?.())
    expect(onStayFree).toHaveBeenCalledTimes(1)
    expect(text.match(/upgrade\.outcomes\.(calendar|retrospective|noticing)\.title/g)).toHaveLength(3)
    expect(text).not.toContain('upgrade.features.')
    expect(text).not.toContain('upgrade.matrix.')
  })

  it.each([
    [null, 'upgrade.convert.trialEyebrow'],
    [0, 'upgrade.convert.trialLastDay'],
    [1, 'upgrade.convert.trialLastDay'],
    [5, 'upgrade.convert.trialDaysLeft'],
  ] as const)('renders the trial countdown boundary for %s days', (trialDaysLeft, label) => {
    const tree = renderPricing({ profile: { isTrialActive: true }, trialDaysLeft })
    expect(renderedText(tree)).toContain(label)
    expect(renderedText(tree)).toContain('upgrade.convert.trialHeading')
    expect(renderedText(tree)).not.toContain('upgrade.convert.freeHeading')
    expect(renderedText(tree)).not.toContain('upgrade.convert.trustLine')
  })

  it('renders plan loading, retry, referral, and restore outcomes', () => {
    const loading = renderPricing({ isLoadingPlans: true })
    expect(renderedText(loading)).toContain('upgrade.plans.loading')

    const onRetryPlans = vi.fn()
    const failed = renderPricing({ isPlansError: true, onRetryPlans })
    expect(renderedText(failed)).toContain('upgrade.plans.error')
    const retry = failed.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
    )[0]
    ;(retry?.props.onPress as (() => void) | undefined)?.()
    expect(onRetryPlans).toHaveBeenCalledTimes(1)

    const online = renderPricing({
      plans: { ...plans, couponPercentOff: 23 },
      yearlyOffer: yearlyReferralOffer,
    })
    expect(renderedText(online)).toContain('upgrade.plans.coupon.line')
    expect(renderedText(online)).not.toContain('upgrade.matrix.')
    expect(renderedText(online)).toContain('upgrade.restorePurchase')

    const restoring = renderPricing({ plans, isOnline: false, isRestoring: true })
    expect(renderedText(restoring)).not.toContain('upgrade.restorePurchase')
    const restoreButton = restoring.root.findAll(
      (node) => node.type === 'Pressable'
        && node.props.accessibilityRole === 'button'
        && (node.props.hitSlop as { top?: number } | undefined)?.top === 6,
    )[0]
    expect(restoreButton?.props.accessibilityState).toEqual({ disabled: true })

    const offlinePlans = renderPricing({ plans, isOnline: false, isRestoring: false })
    expect(renderedText(offlinePlans)).toContain('upgrade.restorePurchase')
    const offlineRestore = offlinePlans.root.findAll(
      (node) => node.type === 'Pressable'
        && node.props.accessibilityRole === 'button'
        && (node.props.hitSlop as { top?: number } | undefined)?.top === 6,
    )[0]
    expect(offlineRestore?.props.accessibilityState).toEqual({ disabled: true })
  })

  it.each([
    [true, false, null, false, false],
    [false, false, null, true, false],
    [true, true, null, true, false],
    [true, false, 'yearly', false, true],
  ] as const)(
    'dims unavailable links with online=%s restoring=%s checkout=%s',
    (isOnline, isRestoring, checkoutLoading, restoreDisabled, declineDisabled) => {
      const onRestore = vi.fn()
      const onStayFree = vi.fn()
      const tree = renderPricing({ plans, isOnline, isRestoring, checkoutLoading, onRestore, onStayFree })
      for (const [onPress, disabled] of [[onRestore, restoreDisabled], [onStayFree, declineDisabled]] as const) {
        const action = tree.root.findAll((node) => node.type === 'Pressable' && node.props.onPress === onPress)[0]!
        expect(action.props.disabled).toBe(disabled)
        expect(action.props.accessibilityState).toEqual({ disabled })
        const resolveStyle = action.props.style as (state: PressableStateCallbackType) => StyleProp<ViewStyle>
        for (const pressed of [false, true]) {
          const style = StyleSheet.flatten(resolveStyle({ pressed }))
          expect(style.opacity ?? 1).toBe(disabled ? 0.4 : 1)
        }
      }
    },
  )

  it('keeps the live retry action hidden while offline', () => {
    const tree = renderPricing({ isPlansError: true, isOnline: false })
    expect(renderedText(tree)).not.toContain('upgrade.plans.error')
    expect(
      tree.root.findAll((node) => node.type === 'Pressable'
        && node.props.accessibilityRole === 'button'),
    ).toHaveLength(0)
  })
})
