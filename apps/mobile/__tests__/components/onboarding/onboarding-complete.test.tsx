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

interface RenderCase {
  createdHabit: string
  remindersOff: boolean
  dueToday: boolean
  general: boolean
  skipped?: boolean
  signedOut?: boolean
}

async function renderText(props: Readonly<RenderCase>): Promise<unknown[]> {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <OnboardingComplete
        createdHabit={props.createdHabit}
        emoji="◎"
        remindersOff={props.remindersOff}
        skipped={props.skipped ?? false}
        signedOut={props.signedOut ?? false}
        dueToday={props.dueToday}
        general={props.general}
        onFinish={vi.fn()}
      />,
    )
  })
  return tree.root
    .findAll((node: { type: unknown }) => node.type === 'Text')
    .map((node: { props: { children?: unknown } }) => node.props.children)
}

describe('OnboardingComplete', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
    for (const key of [
      'onboarding.flow.done.title',
      'onboarding.flow.done.body',
      'onboarding.flow.done.pending',
      'onboarding.flow.done.notTodayTitle',
      'onboarding.flow.done.notTodayBody',
      'onboarding.flow.done.notTodayRemindersOffBody',
      'onboarding.flow.done.remindersOffBody',
      'onboarding.flow.done.notTodayPending',
      'onboarding.flow.done.generalPending',
      'onboarding.flow.done.generalTitle',
      'onboarding.flow.done.generalBody',
      'onboarding.flow.done.skippedTitle',
      'onboarding.flow.done.skippedBody',
      'onboarding.flow.done.skippedSignedOutTitle',
      'onboarding.flow.done.skippedSignedOutBody',
      'onboarding.flow.done.signedOutTitle',
      'onboarding.flow.done.signedOutBody',
      'onboarding.flow.done.seeDay',
      'onboarding.flow.done.signIn',
    ]) {
      expect(i18n.exists(key), `${key} resolves to itself when absent, which makes every assertion below vacuous`).toBe(true)
      mocks.translations.set(key, i18n.t(key))
    }
  })

  it('hides the decorative emoji beside the created habit name', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut={false} dueToday general={false} onFinish={vi.fn()} />,
      )
    })
    const hiddenEmoji = tree.root.findAll((node) =>
      String(node.type) === 'View' && node.props.accessibilityElementsHidden === true
      && node.props.importantForAccessibility === 'no-hide-descendants'
      && node.findAll((child) => String(child.type) === 'Text' && child.props.children === '🏃').length > 0,
    )
    expect(hiddenEmoji).toHaveLength(1)
    expect(hiddenEmoji[0]!.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Exercise')).toHaveLength(0)
    expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Exercise')).toHaveLength(1)
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
          dueToday
          general={false}
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

  it('tells a skipped signed-out run it skipped, not that a plan is ready', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete
          createdHabit=""
          emoji="◎"
          remindersOff={false}
          skipped
          signedOut
          dueToday
          general={false}
          onFinish={vi.fn()}
        />,
      )
    })
    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)
    const buttonLabels = tree.root
      .findAll((node: { type: unknown }) => node.type === 'PillButton')
      .map((node: { props: { children?: unknown } }) => node.props.children)
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.skippedSignedOutTitle'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.skippedSignedOutBody'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.skippedTitle'))
    expect(buttonLabels).toContain(i18n.t('onboarding.flow.done.signIn'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.signedOutTitle'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.skippedBody'))
  })

  it('never claims a habit is in the day when it is not due today', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <OnboardingComplete
          createdHabit="Walk"
          emoji="🚶"
          remindersOff={false}
          skipped={false}
          signedOut={false}
          dueToday={false}
          general={false}
          onFinish={vi.fn()}
        />,
      )
    })
    const renderedText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .map((node: { props: { children?: unknown } }) => node.props.children)
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.notTodayTitle'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.notTodayBody'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.notTodayPending'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.title'))
  })

  it('names the reminders-off outcome for a habit that waits for another day', async () => {
    const renderedText = await renderText({ createdHabit: 'Walk', remindersOff: true, dueToday: false, general: false })
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.notTodayRemindersOffBody'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.notTodayBody'))
  })

  it('never offers a reminder to a habit with no set days', async () => {
    const renderedText = await renderText({ createdHabit: 'Meditate', remindersOff: true, dueToday: false, general: true })
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.generalTitle'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.generalBody'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.generalPending'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.notTodayPending'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.notTodayRemindersOffBody'))
  })

  it('reports the local draft first when a general habit is built signed out', async () => {
    const renderedText = await renderText({ createdHabit: 'Meditate', remindersOff: true, dueToday: false, general: true, signedOut: true })
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.signedOutTitle'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.signedOutBody'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.generalBody'))
  })

  it('names the no-reminders outcome for a habit that is in the day', async () => {
    const renderedText = await renderText({ createdHabit: 'Read', remindersOff: true, dueToday: true, general: false })
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.remindersOffBody'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.pending'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.body'))
  })

  it('sends a skipped signed-in run to the day, and says so', async () => {
    const renderedText = await renderText({ createdHabit: '', remindersOff: false, dueToday: true, general: false, skipped: true })
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.skippedTitle'))
    expect(renderedText).toContain(i18n.t('onboarding.flow.done.skippedBody'))
    expect(renderedText).not.toContain(i18n.t('onboarding.flow.done.skippedSignedOutBody'))
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
          dueToday
          general={false}
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
