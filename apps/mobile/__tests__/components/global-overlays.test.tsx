import { describe, expect, it, vi } from 'vitest'
import React from 'react'

import { OverlayLayer, type OverlayLayerProps } from '@/components/global-overlays'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

interface TestTreeRoot {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

vi.mock('@/components/onboarding/onboarding-flow', () => ({
  OnboardingFlow: 'OnboardingFlow',
}))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  OnboardingActionsProvider: 'OnboardingActionsProvider',
}))
vi.mock('@/components/onboarding/calendar-import-prompt', () => ({
  CalendarImportPrompt: 'CalendarImportPrompt',
}))
vi.mock('@/components/onboarding/astra-import-prompt', () => ({
  AstraImportPrompt: 'AstraImportPrompt',
}))
vi.mock('@/components/referral/referral-prompt', () => ({
  ReferralPrompt: 'ReferralPrompt',
}))
vi.mock('@/components/milestone-share/milestone-share-prompt', () => ({
  MilestoneSharePrompt: 'MilestoneSharePrompt',
}))
vi.mock('@/components/marketing-consent/marketing-consent-prompt', () => ({
  MarketingConsentPrompt: 'MarketingConsentPrompt',
}))
vi.mock('@/components/review-moment/review-moment-sheet', () => ({
  ReviewMomentSheet: 'ReviewMomentSheet',
}))
vi.mock('@/components/ui/expiry-warning', () => ({ ExpiryWarning: 'ExpiryWarning' }))
vi.mock('@/components/ui/trial-expired-modal', () => ({
  TrialExpiredModal: 'TrialExpiredModal',
}))
vi.mock('@/components/version-update-drawer', () => ({
  VersionUpdateDrawer: 'VersionUpdateDrawer',
}))
const onboardingActionsStub: OverlayLayerProps['onboardingActions'] = {
  createHabit: () => Promise.resolve({ id: '', title: '' }),
  updateHabit: () => Promise.resolve(),
  createHabitsBulk: () => Promise.resolve(),
  logHabit: () => Promise.resolve(),
  createGoal: () => Promise.resolve(),
  setWeekStartDay: () => Promise.resolve(),
  deferPushRegistration: () => undefined,
  finishOnboarding: () => Promise.resolve(),
}

function buildProps(
  overrides: Partial<OverlayLayerProps> = {},
): OverlayLayerProps {
  return {
    signedIn: true,
    hasCompletedOnboarding: false,
    showRetainedOnboarding: false,
    onboardingActions: onboardingActionsStub,
    ...overrides,
  }
}

async function renderLayer(
  overrides: Partial<OverlayLayerProps> = {},
): Promise<TestInstance> {
  let instance!: TestInstance
  await TestRenderer.act(() => {
    instance = TestRenderer.create(<OverlayLayer {...buildProps(overrides)} />)
  })
  return instance
}

interface TestRendererInstance extends TestInstance {
  update(element: React.ReactNode): void
}

function suppression(instance: TestInstance, overlayType: string): unknown {
  return instance.root.findAll((node) => node.type === overlayType)[0]?.props.suppressed
}

function isMounted(instance: TestInstance, overlayType: string): boolean {
  return instance.root.findAll((node) => node.type === overlayType).length > 0
}

const GAMIFICATION_OVERLAYS = [
  'MarketingConsentPrompt',
  'ReferralPrompt',
  'MilestoneSharePrompt',
  'ReviewMomentSheet',
]

const POST_ONBOARDING_PROMPTS = ['CalendarImportPrompt', 'AstraImportPrompt']

const SHEET_OWNERS = ['TrialExpiredModal', ...GAMIFICATION_OVERLAYS, ...POST_ONBOARDING_PROMPTS, 'VersionUpdateDrawer']

describe('OverlayLayer gates', () => {
  it('mounts every sheet owner and the expiry warning while signed in, whatever the onboarding state', async () => {
    for (const hasCompletedOnboarding of [false, true]) {
      const instance = await renderLayer({ hasCompletedOnboarding })
      for (const overlay of ['ExpiryWarning', ...SHEET_OWNERS]) expect(isMounted(instance, overlay)).toBe(true)
      expect(suppression(instance, 'TrialExpiredModal')).toBe(false)
      expect(suppression(instance, 'VersionUpdateDrawer')).toBe(false)
    }
  })

  it('suppresses the first-run prompts until onboarding completes', async () => {
    const preOnboarding = await renderLayer({ hasCompletedOnboarding: false })
    const postOnboarding = await renderLayer({ hasCompletedOnboarding: true })
    for (const overlay of [...POST_ONBOARDING_PROMPTS, ...GAMIFICATION_OVERLAYS]) {
      expect(suppression(preOnboarding, overlay)).toBe(true)
      expect(suppression(postOnboarding, overlay)).toBe(false)
    }
  })

  it('gates the retained onboarding flow on the retention guard', async () => {
    const withoutRetention = await renderLayer({ showRetainedOnboarding: false })
    const withRetention = await renderLayer({ showRetainedOnboarding: true })

    expect(isMounted(withoutRetention, 'OnboardingFlow')).toBe(false)
    expect(isMounted(withRetention, 'OnboardingFlow')).toBe(true)
    expect(isMounted(withRetention, 'OnboardingActionsProvider')).toBe(true)
  })

  it('shows only the pending final step after a signed-out flush', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: true, showPendingPro: true })
    expect(instance.root.findAll((node) => node.type === 'OnboardingFlow')).toHaveLength(1)
    expect(instance.root.findAll((node) => node.type === 'OnboardingFlow')[0]!.props.finalStepOnly).toBe(true)
    for (const overlay of [...POST_ONBOARDING_PROMPTS, ...GAMIFICATION_OVERLAYS, 'TrialExpiredModal']) {
      expect(suppression(instance, overlay)).toBe(true)
    }
  })

  it('waits for the account flag before showing another message', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: true, pendingProLoaded: false })
    for (const overlay of [...POST_ONBOARDING_PROMPTS, ...GAMIFICATION_OVERLAYS, 'TrialExpiredModal']) {
      expect(suppression(instance, overlay)).toBe(true)
    }
  })

  it('keeps first-run prompts behind retained onboarding', async () => {
    const instance = await renderLayer({
      hasCompletedOnboarding: true,
      showRetainedOnboarding: true,
    })
    for (const overlay of [...POST_ONBOARDING_PROMPTS, ...GAMIFICATION_OVERLAYS, 'TrialExpiredModal']) {
      expect(suppression(instance, overlay)).toBe(true)
    }
    expect(isMounted(instance, 'OnboardingFlow')).toBe(true)
  })

  it('suppresses every sheet owner after sign-out and keeps only the signed-in chrome away', async () => {
    const instance = await renderLayer({ signedIn: false, hasCompletedOnboarding: true, showRetainedOnboarding: true })
    for (const overlay of SHEET_OWNERS) expect(suppression(instance, overlay)).toBe(true)
    expect(isMounted(instance, 'ExpiryWarning')).toBe(false)
    expect(isMounted(instance, 'OnboardingFlow')).toBe(false)
  })

  it('keeps the same sheet owners mounted through retained onboarding, a pending account flag and sign-out', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: true }) as TestRendererInstance
    const owners = SHEET_OWNERS.map((overlay) => instance.root.findAll((node) => node.type === overlay)[0])
    for (const gate of [
      { showRetainedOnboarding: true },
      { pendingProLoaded: false },
      { signedIn: false },
    ] satisfies Partial<OverlayLayerProps>[]) {
      await TestRenderer.act(() => {
        instance.update(<OverlayLayer {...buildProps({ hasCompletedOnboarding: true, ...gate })} />)
      })
      SHEET_OWNERS.forEach((overlay, index) => {
        expect(instance.root.findAll((node) => node.type === overlay)[0]).toBe(owners[index])
      })
      for (const overlay of [...POST_ONBOARDING_PROMPTS, ...GAMIFICATION_OVERLAYS, 'TrialExpiredModal']) {
        expect(suppression(instance, overlay)).toBe(true)
      }
    }
  })
})
