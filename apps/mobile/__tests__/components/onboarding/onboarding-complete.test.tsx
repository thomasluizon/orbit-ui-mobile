import React from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/lib/i18n'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  translations: new Map<string, string>(),
  reducedMotion: true,
  ringLength: undefined as number | undefined,
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
  usePrefersReducedMotion: () => mocks.reducedMotion,
}))

vi.mock('react-native-svg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-svg')>()
  const MockCircle = React.forwardRef(function MockCircle(
    { children, ...props }: Readonly<{ children?: React.ReactNode }>,
    ref: React.ForwardedRef<{ getTotalLength: () => number | undefined }>,
  ) {
    React.useImperativeHandle(ref, () => ({ getTotalLength: () => mocks.ringLength }), [])
    return React.createElement('Circle', props, children)
  })
  return { ...actual, Circle: MockCircle }
})

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
      'onboarding.flow.done.title',
      'onboarding.flow.done.body',
      'onboarding.flow.done.pending',
      'onboarding.flow.done.seeDay',
    ]) {
      mocks.translations.set(key, i18n.t(key))
    }
  })

  it('names the created habit without claiming a personalized theme', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete
          createdHabit="Exercise"
          emoji="🏃"
          remindersOff={false}
          skipped={false}
          signedOut={false}
          onFinish={vi.fn()}
        />,
      )
    })

    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)

    expect(renderedText).toContain('Exercise')
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.title'))
    expect(JSON.stringify(renderedText).toLowerCase()).not.toContain('theme')
  })

  it('clears the landing ring when the accent length never measures', async () => {
    mocks.reducedMotion = false
    mocks.ringLength = undefined
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete
          createdHabit="Exercise"
          emoji="🏃"
          remindersOff={false}
          skipped={false}
          signedOut={false}
          onFinish={vi.fn()}
        />,
      )
    })
    const svg = tree.root.findAll((node: { type: unknown }) => node.type === 'Svg').at(0)
    expect(svg).toBeDefined()
    await TestRenderer.act(() => {
      (Reflect.get(svg!.props, 'onLayout') as () => void)()
    })

    const accent = tree.root
      .findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'Circle' && node.props.strokeDasharray !== undefined)
      .at(0)
    expect(accent).toBeDefined()
    expect(Reflect.get(accent!.props, 'opacity')).toBe(0)
    mocks.reducedMotion = true
  })
})
