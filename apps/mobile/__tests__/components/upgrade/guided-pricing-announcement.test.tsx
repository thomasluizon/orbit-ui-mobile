import React from 'react'
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { testI18n } from '@/__tests__/support/i18n'
import { GuidedPricingSection } from '@/components/upgrade/guided-pricing-section'
import type { UpgradeTextFn } from '@/components/upgrade/types'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT('en'), i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

const USAGE_LINE = 'You used 3 of 5 AI messages.'
const OFFLINE_LINE = 'I am offline right now.'
const tokens = createTokensV2('orange', 'dark')
const plans: SubscriptionPlans = {
  monthly: { unitAmount: 1990, currency: 'brl' }, yearly: { unitAmount: 11880, currency: 'brl' },
  savingsPercent: 50, couponPercentOff: 20, currency: 'brl',
}
const t = testI18n.getFixedT('en') as unknown as UpgradeTextFn

function plan(focusOnMount: boolean, isOnline = true) {
  return (
    <GuidedPricingSection
      focusOnMount={focusOnMount} profile={{ isTrialActive: false, aiMessagesPeriod: 'day' }} usage={{ aiMessagesUsed: 3, aiMessagesLimit: 5 }} plans={plans}
      isLoadingPlans={false} isPlansError={false} isOnline={isOnline} trialDaysLeft={null} selectedInterval="yearly" onSelectInterval={vi.fn()}
      onStayFree={vi.fn()} monthlyOffer={{ displayPrice: 'R$ 19,90', isReferral: false } as never} yearlyOffer={{ displayPrice: 'R$ 118,80', isReferral: true } as never}
      checkoutLoading={null} checkoutError="" checkoutDisabled={false} onCheckout={vi.fn()} isRestoring={false} onRestore={vi.fn()} onRetryPlans={vi.fn()}
      t={t} tokens={tokens}
    />
  )
}

let tree: ReactTestRenderer | null = null
const hosts = (): ReactTestInstance[] => tree!.root.findAll((node) => typeof node.type === 'string')
const status = () => hosts().find((node) => node.props.accessibilityLiveRegion === 'polite')!.props.children as string
const question = () => hosts().find((node) => node.props.accessibilityRole === 'header' && node.props.accessibilityHint !== undefined)!
const wait = () => act(() => { vi.advanceTimersByTime(1000) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => {
  if (tree) await act(() => tree!.unmount())
  tree = null
  vi.useRealTimers()
})

describe('the Orbit line of the plan question is read once on Android', () => {
  it('leaves the line to the question that takes focus, then announces each later line', async () => {
    await act(() => { tree = create(plan(true)) })
    expect(question().props.accessibilityHint).toBe(USAGE_LINE)
    expect(StyleSheet.flatten(hosts().find((node) => node.props.testID === 'upgrade-orbit-line')!.props.style as StyleProp<TextStyle>)).toMatchObject({ fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4 })
    await wait()
    expect(status()).toBe('')
    await act(() => { tree!.update(plan(true, false)) })
    await wait()
    expect(status()).toBe(OFFLINE_LINE)
    await act(() => { tree!.update(plan(true)) })
    await wait()
    expect(status()).toBe(USAGE_LINE)
  })

  it('announces the line when the question does not take focus', async () => {
    await act(() => { tree = create(plan(false)) })
    await wait()
    expect(status()).toBe(USAGE_LINE)
  })
})
