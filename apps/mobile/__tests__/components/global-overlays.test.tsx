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
vi.mock('@/components/gamification/achievement-toast', () => ({
  AchievementToast: 'AchievementToast',
}))
vi.mock('@/components/gamification/all-done-celebration', () => ({
  AllDoneCelebration: 'AllDoneCelebration',
}))
vi.mock('@/components/gamification/goal-completed-celebration', () => ({
  GoalCompletedCelebration: 'GoalCompletedCelebration',
}))
vi.mock('@/components/gamification/level-up-overlay', () => ({
  LevelUpOverlay: 'LevelUpOverlay',
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
vi.mock('@/components/gamification/streak-celebration', () => ({
  StreakCelebration: 'StreakCelebration',
}))
vi.mock('@/components/gamification/streak-freeze-celebration', () => ({
  StreakFreezeCelebration: 'StreakFreezeCelebration',
}))
vi.mock('@/components/gamification/welcome-back-toast', () => ({
  WelcomeBackToast: 'WelcomeBackToast',
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
  createHabit: async () => ({ id: '', title: '' }),
  createHabitsBulk: async () => {},
  logHabit: async () => {},
  createGoal: async () => {},
  setWeekStartDay: async () => {},
  setColorScheme: async () => {},
  finishOnboarding: async () => {},
}

function buildProps(
  overrides: Partial<OverlayLayerProps> = {},
): OverlayLayerProps {
  return {
    hasCompletedOnboarding: false,
    hasProAccess: false,
    canViewGamification: false,
    showRetainedOnboarding: false,
    onboardingActions: onboardingActionsStub,
    leveledUp: false,
    newLevel: null,
    onClearLevelUp: () => {},
    streakFreezeRef: () => {},
    ...overrides,
  }
}

async function renderLayer(
  overrides: Partial<OverlayLayerProps> = {},
): Promise<TestInstance> {
  let instance: TestInstance | null = null
  await TestRenderer.act(async () => {
    instance = TestRenderer.create(<OverlayLayer {...buildProps(overrides)} />)
  })
  if (!instance) throw new Error('render failed')
  return instance
}

function isMounted(instance: TestInstance, overlayType: string): boolean {
  return instance.root.findAll((node) => node.type === overlayType).length > 0
}

const ALWAYS_MOUNTED = [
  'ExpiryWarning',
  'TrialExpiredModal',
  'StreakFreezeCelebration',
  'VersionUpdateDrawer',
  'TourProvider',
  'TourOverlay',
]

const GAMIFICATION_OVERLAYS = [
  'StreakCelebration',
  'AllDoneCelebration',
  'GoalCompletedCelebration',
  'WelcomeBackToast',
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
      canViewGamification: true,
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

  it('gates the achievement toast on pro access', async () => {
    const withoutPro = await renderLayer({
      hasCompletedOnboarding: true,
      hasProAccess: false,
    })
    const withPro = await renderLayer({
      hasCompletedOnboarding: true,
      hasProAccess: true,
    })

    expect(isMounted(withoutPro, 'AchievementToast')).toBe(false)
    expect(isMounted(withPro, 'AchievementToast')).toBe(true)
  })

  it('gates the level-up overlay on gamification visibility', async () => {
    const hidden = await renderLayer({
      hasCompletedOnboarding: true,
      canViewGamification: false,
    })
    const visible = await renderLayer({
      hasCompletedOnboarding: true,
      canViewGamification: true,
      leveledUp: true,
      newLevel: 4,
    })

    expect(isMounted(hidden, 'LevelUpOverlay')).toBe(false)
    expect(isMounted(visible, 'LevelUpOverlay')).toBe(true)
  })

  it('gates the retained onboarding flow on the retention guard', async () => {
    const withoutRetention = await renderLayer({ showRetainedOnboarding: false })
    const withRetention = await renderLayer({ showRetainedOnboarding: true })

    expect(isMounted(withoutRetention, 'OnboardingFlow')).toBe(false)
    expect(isMounted(withRetention, 'OnboardingFlow')).toBe(true)
    expect(isMounted(withRetention, 'OnboardingActionsProvider')).toBe(true)
  })
})
