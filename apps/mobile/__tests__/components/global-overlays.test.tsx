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

vi.mock('expo-constants', () => ({ default: { expoGoConfig: null } }))
vi.mock('@/components/ui/push-prompt', () => ({
  PushPrompt: () => React.createElement('PushPrompt'),
}))
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
vi.mock('@/components/tour/tour-provider', () => ({ TourProvider: 'TourProvider' }))
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: 'TourOverlay' }))
const onboardingActionsStub: OverlayLayerProps['onboardingActions'] = {
  createHabit: () => Promise.resolve({ id: '', title: '' }),
  createHabitsBulk: () => Promise.resolve(),
  logHabit: () => Promise.resolve(),
  createGoal: () => Promise.resolve(),
  setWeekStartDay: () => Promise.resolve(),
  finishOnboarding: () => Promise.resolve(),
}

function buildProps(
  overrides: Partial<OverlayLayerProps> = {},
): OverlayLayerProps {
  return {
    hasCompletedOnboarding: false,
    hasProAccess: false,
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

function isMounted(instance: TestInstance, overlayType: string): boolean {
  return instance.root.findAll((node) => node.type === overlayType).length > 0
}

const ALWAYS_MOUNTED = [
  'ExpiryWarning',
  'TrialExpiredModal',
  'VersionUpdateDrawer',
  'TourProvider',
  'TourOverlay',
]

const GAMIFICATION_OVERLAYS = [
  'MarketingConsentPrompt',
  'ReferralPrompt',
  'MilestoneSharePrompt',
  'ReviewMomentSheet',
]

const POST_ONBOARDING_PROMPTS = ['CalendarImportPrompt', 'AstraImportPrompt']

describe('OverlayLayer mount matrix', () => {
  it('mounts the always-on overlays regardless of onboarding state', async () => {
    const preOnboarding = await renderLayer({ hasCompletedOnboarding: false })
    const postOnboarding = await renderLayer({ hasCompletedOnboarding: true })

    for (const overlay of ALWAYS_MOUNTED) {
      expect(isMounted(preOnboarding, overlay)).toBe(true)
      expect(isMounted(postOnboarding, overlay)).toBe(true)
    }
  })

  it('does not mount standalone goal creation in the global overlay layer', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: true })

    expect(isMounted(instance, 'CreateGoalModal')).toBe(false)
  })

  it('does not mount post-onboarding prompts before onboarding completes', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: false })

    for (const overlay of POST_ONBOARDING_PROMPTS) {
      expect(isMounted(instance, overlay)).toBe(false)
    }
  })

  it('mounts post-onboarding prompts once onboarding completes', async () => {
    const instance = await renderLayer({ hasCompletedOnboarding: true })

    for (const overlay of POST_ONBOARDING_PROMPTS) {
      expect(isMounted(instance, overlay)).toBe(true)
    }
  })

  it('gates the gamification celebration cluster on onboarding completion', async () => {
    const preOnboarding = await renderLayer({ hasCompletedOnboarding: false })
    const postOnboarding = await renderLayer({
      hasCompletedOnboarding: true,
      hasProAccess: true,
    })

    for (const overlay of GAMIFICATION_OVERLAYS) {
      expect(isMounted(preOnboarding, overlay)).toBe(false)
      expect(isMounted(postOnboarding, overlay)).toBe(true)
    }
  })

  it('gates the lazily-loaded push prompt on onboarding completion', async () => {
    const preOnboarding = await renderLayer({ hasCompletedOnboarding: false })
    const postOnboarding = await renderLayer({ hasCompletedOnboarding: true })

    expect(isMounted(preOnboarding, 'PushPrompt')).toBe(false)
    expect(isMounted(postOnboarding, 'PushPrompt')).toBe(true)
  })



  it('gates the retained onboarding flow on the retention guard', async () => {
    const withoutRetention = await renderLayer({ showRetainedOnboarding: false })
    const withRetention = await renderLayer({ showRetainedOnboarding: true })

    expect(isMounted(withoutRetention, 'OnboardingFlow')).toBe(false)
    expect(isMounted(withRetention, 'OnboardingFlow')).toBe(true)
    expect(isMounted(withRetention, 'OnboardingActionsProvider')).toBe(true)
  })
})
