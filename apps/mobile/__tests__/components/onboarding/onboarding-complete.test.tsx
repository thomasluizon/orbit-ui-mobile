import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/lib/i18n'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  translations: new Map<string, string>(),
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    Animated: {
      ...actual.Animated,
      multiply: (value: unknown) => value,
    },
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => mocks.translations.get(key) ?? key,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      hasProAccess: true,
      isTrialActive: false,
      trialEndsAt: null,
    },
  }),
}))

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingIsLive: () => true,
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (date: Date) => date.toISOString() }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'blue', currentTheme: 'light' }),
}))

vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: () => undefined,
  usePrefersReducedMotion: () => true,
}))

vi.mock('@/components/ui/info-card', () => ({
  InfoCard: ({ children }: Readonly<{ children?: React.ReactNode }>) =>
    React.createElement('InfoCard', null, children),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children }: Readonly<{ children?: React.ReactNode }>) =>
    React.createElement('PillButton', null, children),
}))

vi.mock('@/components/ui/verified-badge', () => ({
  VerifiedBadge: () => null,
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe('OnboardingComplete', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
    for (const key of [
      'onboarding.flow.complete.recap.habit',
      'onboarding.flow.complete.recap.theme',
    ]) {
      mocks.translations.set(key, i18n.t(key))
    }
  })

  it('does not claim a Pro account personalized a theme', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete
          createdHabit="Exercise"
          onFinish={vi.fn()}
        />,
      )
    })

    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)

    expect(renderedText).toContain(i18n.t('onboarding.flow.complete.recap.habit'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.complete.recap.theme'))
  })
})
