import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'

const { routerMock, pathnameState, actionsMock, captured } = vi.hoisted(() => {
  const router = { replace: vi.fn(), push: vi.fn(), navigate: vi.fn() }
  const capturedState: {
    beginPress?: () => void
    importPress?: () => void | Promise<void>
    welcomeRendered: boolean
  } = { welcomeRendered: false }
  return {
    routerMock: router,
    pathnameState: { value: '/' },
    actionsMock: {
      createHabit: vi.fn(async (input: { title: string }) => ({
        id: '0',
        title: input.title,
      })),
      logHabit: vi.fn(async () => undefined),
      createGoal: vi.fn(async () => undefined),
      setWeekStartDay: vi.fn(async () => undefined),
      setColorScheme: vi.fn(async () => undefined),
      finishOnboarding: vi.fn(async () => undefined),
      onImport: () => router.replace('/chat'),
    },
    captured: capturedState,
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => routerMock,
  usePathname: () => pathnameState.value,
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: false }),
}))

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  OnboardingActionsProvider: ({
    children,
  }: Readonly<{ children?: React.ReactNode }>) => children,
  useOnboardingActions: () => actionsMock,
  useOnboardingHasProAccess: () => true,
  useOnboardingIsLive: () => false,
}))

vi.mock('@/components/ui/gradient-top', () => ({
  GradientTop: () => null,
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({
    children,
    onPress,
  }: Readonly<{ children?: React.ReactNode; onPress?: () => void }>) => {
    captured.beginPress = onPress
    return React.createElement('PillButton', { onPress }, children)
  },
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({
    children,
  }: Readonly<{ children?: React.ReactNode }>) =>
    React.createElement('KeyboardAwareScrollView', null, children),
}))

vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => {
    captured.welcomeRendered = true
    return React.createElement('OnboardingWelcome')
  },
}))

vi.mock('@/components/onboarding/onboarding-meet-astra', () => ({
  OnboardingMeetAstra: ({
    onImport,
  }: Readonly<{ onImport?: () => void | Promise<void> }>) => {
    captured.importPress = onImport
    return React.createElement('OnboardingMeetAstra', { onImport })
  },
}))

vi.mock('@/components/onboarding/onboarding-template-packs', () => ({
  OnboardingTemplatePacks: () => null,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: () => null,
}))
vi.mock('@/components/onboarding/onboarding-complete-habit', () => ({
  OnboardingCompleteHabit: () => null,
}))
vi.mock('@/components/onboarding/onboarding-create-goal', () => ({
  OnboardingCreateGoal: () => null,
}))
vi.mock('@/components/onboarding/onboarding-features', () => ({
  OnboardingFeatures: () => null,
}))
vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: () => null,
}))

import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe('OnboardingFlow helpers', () => {
  it('keeps pro users on the full step sequence', () => {
    expect(getOnboardingDisplayTotal(true)).toBe(7)
    expect(getOnboardingDisplayStep(0, true)).toBe(1)
    expect(getOnboardingNextStep(2, true)).toBe(3)
    expect(getOnboardingPreviousStep(3, true)).toBe(2)
  })

  it('skips the goal creation step for free users', () => {
    expect(getOnboardingDisplayTotal(false)).toBe(6)
    expect(getOnboardingNextStep(3, false)).toBe(5)
    expect(getOnboardingDisplayStep(5, false)).toBe(5)
    expect(getOnboardingPreviousStep(5, false)).toBe(3)
  })

  it('hides the footer only on interactive onboarding steps', () => {
    expect(shouldHideOnboardingFooter(0)).toBe(false)
    expect(shouldHideOnboardingFooter(1)).toBe(true)
    expect(shouldHideOnboardingFooter(2)).toBe(true)
    expect(shouldHideOnboardingFooter(3)).toBe(true)
    expect(shouldHideOnboardingFooter(4)).toBe(true)
    expect(shouldHideOnboardingFooter(5)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_COMPLETE_STEP)).toBe(true)
  })
})

describe('OnboardingFlow import handoff + resume', () => {
  beforeEach(() => {
    routerMock.replace.mockClear()
    routerMock.push.mockClear()
    actionsMock.finishOnboarding.mockClear()
    captured.beginPress = undefined
    captured.importPress = undefined
    captured.welcomeRendered = false
    pathnameState.value = '/'
  })

  it('routes into Astra on import without completing onboarding', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<OnboardingFlow />)
    })

    await TestRenderer.act(async () => {
      captured.beginPress?.()
    })

    await TestRenderer.act(async () => {
      await captured.importPress?.()
    })

    expect(routerMock.replace).toHaveBeenCalledWith('/chat')
    expect(actionsMock.finishOnboarding).not.toHaveBeenCalled()
  })

  it('hides the overlay while on the chat route and restores it after leaving chat', async () => {
    pathnameState.value = '/chat'
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<OnboardingFlow />)
    })
    expect(captured.welcomeRendered).toBe(false)

    pathnameState.value = '/'
    captured.welcomeRendered = false
    await TestRenderer.act(async () => {
      tree.update(<OnboardingFlow />)
    })
    expect(captured.welcomeRendered).toBe(true)
  })
})
