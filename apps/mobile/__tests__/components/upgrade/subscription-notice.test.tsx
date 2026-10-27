import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'
import { UsageCard } from '@/components/upgrade/usage-card'
import type { UpgradeTextFn } from '@/components/upgrade/types'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/components/upgrade/usage-card', () => ({ UsageCard: vi.fn(() => null) }))
vi.mock('@/hooks/use-subscription-plans', () => ({ formatPrice: vi.fn(), monthlyEquivalent: vi.fn() }))

const TestRenderer = require('react-test-renderer')
const status: SubscriptionStatus = {
  plan: 'free', hasProAccess: false, isTrialActive: false, trialEndsAt: null,
  planExpiresAt: null, aiMessagesUsed: 2, aiMessagesLimit: 7, isLifetimePro: false,
  subscriptionInterval: null, source: null, lapseReason: 'payment_failed',
  subscriptionEndedAtUtc: '2026-08-01T00:00:00Z',
}
const t: UpgradeTextFn = (key, params) => params ? `${key}:${JSON.stringify(params)}` : key
const tokens = createTokensV2('purple', 'dark')

function noticeText(nextStatus: SubscriptionStatus) {
  let tree: { toJSON: () => unknown; unmount: () => void } | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<SubscriptionNotice status={nextStatus} locale="en" t={t} tokens={tokens} />)
  })
  const text = JSON.stringify(tree!.toJSON())
  TestRenderer.act(() => tree!.unmount())
  return text
}

describe('lapsed subscription notice (mobile)', () => {
  it('marks the Astra allowance and Pro benefit at their existing sizes', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SubscriptionNotice status={status} locale="en" t={t} tokens={tokens} />)
    })
    try {
      for (const [testID, size] of [['astra-mark', 16], ['astra-mark', 20]] as const) {
        const marks = tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'Svg' && node.props.testID === testID && 'width' in node.props && node.props.width === size)
        expect(marks).toHaveLength(1)
        expect(marks[0].props).toMatchObject({ width: size, height: size, color: tokens.fg3, accessible: false })
      }
      expect(JSON.stringify(tree.toJSON())).toContain('upgrade.included')
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  it.each([0, 4, 5])('never renders UsageCard at %i of 5 messages', (aiMessagesUsed) => {
    vi.mocked(UsageCard).mockClear()
    const text = noticeText({ ...status, aiMessagesUsed, aiMessagesLimit: 5 })
    expect(text).toContain('upgrade.billing.lapsed.title')
    expect(text).toContain('upgrade.billing.lapsed.lostMessages:')
    expect(text).toContain('limit\\":5')
    expect(UsageCard).not.toHaveBeenCalled()
  })

  it('lists each lost entitlement separately with the current message allowance', () => {
    const text = noticeText(status)
    expect(text).toContain('upgrade.billing.lapsed.lostMessages:')
    expect(text).toContain('limit\\":7')
    expect(text).toContain('upgrade.billing.lapsed.lostCalendar')
    expect(text).toContain('upgrade.billing.lapsed.lostRetrospective')
    expect(text).not.toContain('upgrade.billing.lapsed.features')
  })

  it('explains a payment lapse and recovery with or without a date, withholding nonactionable reasons', () => {
    const dated = noticeText(status)
    expect(dated).toContain('upgrade.billing.lapsed.payment_failed:')
    expect(dated).toContain('upgrade.billing.lapsed.paymentFix')
    const undated = noticeText({ ...status, subscriptionEndedAtUtc: null })
    expect(undated).toContain('upgrade.billing.paymentIssue.title')
    expect(undated).toContain('upgrade.billing.lapsed.paymentFix')
    for (const lapseReason of ['canceled', 'expired', null] as const) {
      const text = noticeText({ ...status, lapseReason })
      expect(text).toContain('upgrade.billing.lapsed.ended:')
      expect(text).not.toContain('upgrade.billing.lapsed.paymentFix')
      expect(text).not.toContain('upgrade.billing.paymentIssue.title')
    }
  })
})
