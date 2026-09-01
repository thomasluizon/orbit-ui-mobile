import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  ONBOARDING_WEEK_START_OPTIONS,
} from '@orbit/shared/utils'
import { OnboardingWelcome } from '@/components/onboarding/onboarding-welcome'

const mocks = vi.hoisted(() => ({
  setWeekStartDay: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: (selector: (state: { weekStartDay: null }) => unknown) =>
    selector({ weekStartDay: null }),
}))

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ setWeekStartDay: mocks.setWeekStartDay }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
}))

vi.mock('@/components/ui/app-logo', () => ({ AppLogo: () => null }))
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) =>
    React.createElement('Chip', { onPress }, children),
}))

const TestRenderer = require('react-test-renderer')

describe('OnboardingWelcome helpers', () => {
  it('exposes both onboarding week-start options', () => {
    expect(ONBOARDING_WEEK_START_OPTIONS).toEqual([
      { value: 1, labelKey: 'settings.weekStartDay.monday' },
      { value: 0, labelKey: 'settings.weekStartDay.sunday' },
    ])
  })

  it('keeps the free-user display total one step shorter', () => {
    expect(getOnboardingDisplayTotal(true)).toBe(7)
    expect(getOnboardingDisplayTotal(false)).toBe(6)
  })

  it('compresses the display step after the skipped goal step for free users', () => {
    expect(getOnboardingDisplayStep(0, false)).toBe(1)
    expect(getOnboardingDisplayStep(5, false)).toBe(5)
    expect(getOnboardingDisplayStep(5, true)).toBe(6)
  })
})

describe('OnboardingWelcome', () => {
  it('renders week-start choices without a color scheme control', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingWelcome />)
    })
    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)
    expect(renderedText).toContain('onboarding.flow.welcome.weekStart')
    expect(renderedText).not.toContain('onboarding.flow.welcome.colorScheme')
  })
})
