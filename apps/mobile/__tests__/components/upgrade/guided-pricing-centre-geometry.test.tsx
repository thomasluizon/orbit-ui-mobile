import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { testI18n } from '@/__tests__/support/i18n'
import { TrialExpiredDialog } from '@/components/ui/trial-expired-dialog'
import { GuidedPlanFooter, GuidedPricingSection } from '@/components/upgrade/guided-pricing-section'
import { PurchaseResult } from '@/components/upgrade/purchase-result'
import type { UpgradeTextFn } from '@/components/upgrade/types'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions } from '@/test-mocks/react-native'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

const HEIGHT = 780
const FRAME_PADDING = 16
const MIN_TARGET = 48
const WIDTHS = [320, 360, 384, 412] as const
const LOCALES = ['pt-BR', 'en'] as const
const tokens = createTokensV2('orange', 'dark')
const plans: SubscriptionPlans = {
  monthly: { unitAmount: 1990, currency: 'brl' }, yearly: { unitAmount: 11880, currency: 'brl' },
  savingsPercent: 50, couponPercentOff: 20, currency: 'brl',
}
const proStatus: SubscriptionStatus = {
  plan: 'pro', hasProAccess: true, isTrialActive: false, trialEndsAt: null, planExpiresAt: '2026-10-01T01:30:00Z',
  aiMessagesUsed: 3, aiMessagesLimit: 250, aiMessagesPeriod: 'week', isLifetimePro: false,
  subscriptionInterval: 'yearly', source: 'play', lapseReason: null, subscriptionEndedAtUtc: null,
}
const PAUSED_FEATURES = ['trial.expired.astraCeiling', 'trial.expired.calendarSync', 'trial.expired.retrospective', 'trial.expired.proactiveAstra'] as const

let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

async function mount(width: number, element: React.ReactElement) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<View testID="frame" style={{ width, height: HEIGHT }}>{element}</View>) as GeometryTree })
}

/** The boxes of the open dialog. The window of a `Modal` fills the screen, so the `Modal` host is the root that takes the viewport. */
function measureDialog(width: number) {
  const modal = findHost([tree!.toJSON()], (host) => host.type === 'Modal')!
  return measureSafeArea(modal, (host) => host.props.testID, { width, height: HEIGHT })
}

function findHost(hosts: GeometryHost[], match: (host: GeometryHost) => boolean): GeometryHost | undefined {
  for (const host of hosts) {
    if (match(host)) return host
    const found = findHost((host.children ?? []).filter((child): child is GeometryHost => typeof child !== 'string'), match)
    if (found) return found
  }
  return undefined
}

function centreX(box: { left: number; width: number }) {
  return box.left + box.width / 2
}

function centreY(box: { top: number; bottom: number }) {
  return (box.top + box.bottom) / 2
}

function planSection(t: UpgradeTextFn) {
  return (
    <GuidedPricingSection
      profile={{ isTrialActive: false, aiMessagesPeriod: 'day' }} usage={{ aiMessagesUsed: 3, aiMessagesLimit: 5 }} plans={plans}
      isLoadingPlans={false} isPlansError={false} isOnline trialDaysLeft={null} selectedInterval="yearly" onSelectInterval={vi.fn()}
      onStayFree={vi.fn()} monthlyOffer={{ displayPrice: 'R$ 19,90', isReferral: false } as never} yearlyOffer={{ displayPrice: 'R$ 118,80', isReferral: true } as never}
      checkoutLoading={null} checkoutError="" checkoutDisabled={false} onCheckout={vi.fn()} isRestoring={false} onRestore={vi.fn()} onRetryPlans={vi.fn()}
      primaryInFooter t={t} tokens={tokens}
    />
  )
}

/**
 * `design/canvas/Orbit Pro.dc.html` stacks the tiers at 412 (line 79) and puts them side by side, each hugging its content, in the wide frame (lines 169 and 171),
 * with the interval control capped at 320 (line 156). `DESIGN.md` maps that boundary to the `sm` boundary of the upgrade screen, 640 on both platforms.
 * The pinned action spans the column below the mobile breakpoint, 768, and hugs its label from it (`DESIGN.md`, Buttons, width).
 */
describe('the plan cards, the interval control and the pinned action of the compact shell from 412 to 1023 px', () => {
  async function mountSection(width: number) {
    mocks.language = 'en'
    await mount(width, <View testID="free-area" style={{ flex: 1, paddingHorizontal: FRAME_PADDING }}>{planSection(testI18n.getFixedT('en'))}</View>)
    return measureSafeArea(tree!.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
  }

  it.each([412, 639])('stacks the plan cards and spans the interval control at %i px', async (width) => {
    const boxes = await mountSection(width)
    const block = boxes.get('upgrade-block')!
    const yearly = boxes.get('upgrade-plan-option-yearly')!
    const monthly = boxes.get('upgrade-plan-option-monthly')!
    expect(monthly.top).toBeGreaterThanOrEqual(yearly.bottom)
    expect(yearly.width).toBe(block.width)
    expect(boxes.get('upgrade-interval')!.width).toBe(block.width)
  })

  it.each([640, 700, 768, 1023])('puts the plan cards side by side at %i px, each hugging its content, and caps the interval control at 320', async (width) => {
    const boxes = await mountSection(width)
    const block = boxes.get('upgrade-block')!
    const yearly = boxes.get('upgrade-plan-option-yearly')!
    const monthly = boxes.get('upgrade-plan-option-monthly')!
    const interval = boxes.get('upgrade-interval')!
    expect(Math.abs(monthly.top - yearly.top)).toBeLessThanOrEqual(1)
    expect(yearly.left).toBeGreaterThanOrEqual(block.left)
    expect(monthly.left).toBeGreaterThan(yearly.left + yearly.width)
    expect(monthly.left + monthly.width).toBeLessThanOrEqual(block.left + block.width)
    expect(Math.abs(monthly.width - yearly.width)).toBeLessThanOrEqual(1)
    expect(monthly.bottom - monthly.top).toBeLessThan(yearly.bottom - yearly.top)
    expect(interval.width).toBe(320)
    expect(Math.abs(centreX(interval) - centreX(block))).toBeLessThanOrEqual(1)
  })

  it.each([[412, true], [767, true], [768, false], [1023, false]] as const)('spans the pinned action across its footer at %i px: %s', async (width, spans) => {
    mocks.language = 'en'
    const t = testI18n.getFixedT('en') as UpgradeTextFn
    await mount(width, (
      <View testID="free-area" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <GuidedPlanFooter plans={plans} isLoadingPlans={false} isPlansError={false} isOnline monthlyOffer={null} yearlyOffer={null} selectedInterval="yearly"
          checkoutLoading={null} checkoutDisabled={false} onCheckout={vi.fn()} checkoutError="" t={t} tokens={tokens} />
      </View>
    ))
    const boxes = measureSafeArea(tree!.toJSON(), (host) => (String(host.props.testID).startsWith('button-') ? 'primary' : host.props.testID), { width, height: HEIGHT })
    const footer = boxes.get('upgrade-plan-footer')!
    const primary = boxes.get('primary')!
    if (spans) expect(primary.width).toBe(footer.width)
    else {
      expect(primary.width).toBeLessThan(footer.width)
      expect(primary.width).toBeLessThanOrEqual(360)
      expect(Math.abs(centreX(primary) - centreX(footer))).toBeLessThanOrEqual(1)
    }
  })
})

describe.each(WIDTHS)('the plan question and the dialogs of the upgrade route at %i px', (width) => {
  describe.each(LOCALES)('in %s', (language) => {
    it('centres the plan block on the horizontal axis, under the header, with no plan card past its edges', async () => {
      mocks.language = language
      const t = testI18n.getFixedT(language) as UpgradeTextFn
      await mount(width, (
        <View testID="free-area" style={{ flex: 1, paddingHorizontal: FRAME_PADDING }}>
          <GuidedPricingSection
            profile={{ isTrialActive: false, aiMessagesPeriod: 'day' }} usage={{ aiMessagesUsed: 3, aiMessagesLimit: 5 }} plans={plans}
            isLoadingPlans={false} isPlansError={false} isOnline trialDaysLeft={null} selectedInterval="yearly" onSelectInterval={vi.fn()}
            onStayFree={vi.fn()} monthlyOffer={{ displayPrice: 'R$ 19,90', isReferral: false } as never} yearlyOffer={{ displayPrice: 'R$ 118,80', isReferral: true } as never}
            checkoutLoading={null} checkoutError="" checkoutDisabled={false} onCheckout={vi.fn()} isRestoring={false} onRestore={vi.fn()} onRetryPlans={vi.fn()}
            t={t} tokens={tokens}
          />
        </View>
      ))
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('upgrade-block')!
      expect(block.width).toBe(width - FRAME_PADDING * 2)
      expect(Math.abs(centreX(block) - centreX(free))).toBeLessThanOrEqual(1)
      expect(Math.abs(centreX(block) - width / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(block.top - free.top)).toBeLessThanOrEqual(1)
      for (const interval of ['yearly', 'monthly']) {
        const option = boxes.get(`upgrade-plan-option-${interval}`)!
        expect(option.left).toBeGreaterThanOrEqual(block.left)
        expect(option.left + option.width).toBeLessThanOrEqual(block.left + block.width)
        expect(option.bottom - option.top).toBeGreaterThanOrEqual(MIN_TARGET)
      }
    })

    it('centres the trial expired dialog on both axes', async () => {
      mocks.language = language
      await mount(width, <TrialExpiredDialog pausedFeatures={PAUSED_FEATURES} savingsPercent={41} onSeePlans={vi.fn()} onContinueFree={vi.fn()} onClose={vi.fn()} />)
      const boxes = measureDialog(width)
      const free = boxes.get('trial-expired-centre')!
      const panel = boxes.get('trial-expired-dialog')!
      expect(free.bottom - free.top).toBe(HEIGHT)
      expect(Math.abs(centreX(panel) - centreX(free))).toBeLessThanOrEqual(1)
      expect(Math.abs(centreY(panel) - centreY(free))).toBeLessThanOrEqual(1)
      expect(panel.bottom - panel.top).toBeGreaterThan(MIN_TARGET * 2)
      expect(panel.bottom - panel.top).toBeLessThan(HEIGHT)
      expect(panel.left).toBeGreaterThanOrEqual(FRAME_PADDING)
      expect(panel.left + panel.width).toBeLessThanOrEqual(width - FRAME_PADDING)
    })

    it.each([['renews', null], ['ends', 'canceled']] as const)('centres the result dialog of a purchase that %s on both axes', async (_sentence, lapseReason) => {
      mocks.language = language
      await mount(width, (
        <PurchaseResult purchaseConfirmed status={{ ...proStatus, lapseReason }} billing={null} timeZone="America/Sao_Paulo" returnsToOrigin={false} onOpen={vi.fn()} onClose={vi.fn()} />
      ))
      const boxes = measureDialog(width)
      const free = boxes.get('result-dialog-centre')!
      const panel = boxes.get('result-dialog')!
      expect(free.bottom - free.top).toBe(HEIGHT)
      expect(panel.bottom - panel.top).toBeGreaterThan(MIN_TARGET * 2)
      expect(Math.abs(centreX(panel) - centreX(free))).toBeLessThanOrEqual(1)
      expect(Math.abs(centreY(panel) - centreY(free))).toBeLessThanOrEqual(1)
    })
  })
})
