import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  ONBOARDING_TOTAL_STEPS,
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

  it('uses the same three-step display for every account', () => {
    expect(getOnboardingDisplayTotal()).toBe(ONBOARDING_TOTAL_STEPS)
  })

  it('maps the zero-based flow index to the displayed position', () => {
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_TOTAL_STEPS - 1)).toBe(
      ONBOARDING_TOTAL_STEPS,
    )
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
