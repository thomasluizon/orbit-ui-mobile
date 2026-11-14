import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildOnboardingHabitInput, buildOnboardingScheduleFromPhrase } from '@orbit/shared/utils'
import { holdAccount } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), completed: vi.fn(), event: vi.fn(), suggest: vi.fn(), subscribe: vi.fn(), requestPermission: vi.fn(),
  createHabit: vi.fn(), updateHabit: vi.fn(), recordCompletion: vi.fn(), finishOnboarding: vi.fn(), deferPush: vi.fn(),
  plan: 'Pro' as 'Pro' | 'Free', online: true, suggestionAvailable: false,
}))

vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: mocks.push, replace: mocks.push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { timeZone: 'UTC', aiMessagesLimit: 5, aiMessagesUsed: 0, hasProAccess: mocks.plan === 'Pro', isTrialActive: false, isLifetimePro: mocks.plan === 'Pro', trialEndsAt: null, planExpiresAt: mocks.plan === 'Pro' ? '2999-01-01T00:00:00Z' : null },
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: mocks.suggestionAvailable, mutateAsync: mocks.suggest, verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => ({ supported: true, permission: 'default', status: 'not-registered' }),
  subscribeToPushNotifications: mocks.subscribe,
  requestWebPushPermission: mocks.requestPermission,
}))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: vi.fn() }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: mocks.event }))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => <p data-testid="pro-step">pro</p> }))

import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const locales = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const
type Messages = typeof en

function stubMedia(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }))
}

function actions(): OnboardingActions {
  return {
    createHabit: mocks.createHabit, updateHabit: mocks.updateHabit, createHabitsBulk: vi.fn(), logHabit: vi.fn(), createGoal: vi.fn(),
    setWeekStartDay: vi.fn(), deferPushRegistration: mocks.deferPush, recordCompletion: mocks.recordCompletion, finishOnboarding: mocks.finishOnboarding,
  }
}

function mount(locale: string, messages: Messages, options: { isLive?: boolean; guided?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <OnboardingActionsProvider actions={actions()} isLive={options.isLive ?? true}>
          <OnboardingFlow guided={options.guided ?? true} />
        </OnboardingActionsProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

function heading() {
  return screen.getByRole('heading', { level: 1 }).textContent
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function progress() {
  return document.querySelector('[data-question-flow] header ol')?.getAttribute('aria-label')
}

async function typePhrase(messages: Messages, phrase: string) {
  fireEvent.change(screen.getByLabelText(messages.onboarding.flow.what.title, { selector: 'textarea' }), { target: { value: phrase } })
  await act(async () => { press(messages.onboarding.flow.continue) })
}

function skipIntro(messages: Messages) {
  press(messages.onboarding.flow.guided.intro.skip)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.plan = 'Pro'
  mocks.online = true
  mocks.suggestionAvailable = false
  mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
  mocks.updateHabit.mockResolvedValue(undefined)
  mocks.recordCompletion.mockResolvedValue(undefined)
  mocks.finishOnboarding.mockResolvedValue(undefined)
  mocks.subscribe.mockResolvedValue({ supported: true, status: 'registered' })
  useOnboardingDraftStore.setState({ introSeen: false, onboardingLocallyDone: false })
  holdAccount('user-1')
  stubMedia(false)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe.each(locales)('guided onboarding in $locale', ({ locale, messages }) => {
  const flow = messages.onboarding.flow
  const guided = flow.guided

  it('explains Orbit on three intro screens before the first question, and reaches it in three taps', () => {
    mount(locale, messages)
    const intros = [guided.intro.talk, guided.intro.routine, guided.intro.restart]
    intros.forEach((intro, index) => {
      expect(heading()).toBe(intro.title)
      expect(screen.getByText(intro.body)).toBeInTheDocument()
      expect(progress()).toBe(guided.progress.replace('{position}', String(index + 1)).replace('{total}', '3'))
      expect(document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state')).toBe('parado')
      expect(screen.getByRole('button', { name: guided.intro.skip })).toBeInTheDocument()
      press(flow.continue)
    })
    expect(heading()).toBe(flow.what.title)
    expect(useOnboardingDraftStore.getState().introSeen).toBe(true)
  })

  it.each([0, 1, 2])('skips the intro from screen %i straight to the first question, and never shows it again', (screenIndex) => {
    mount(locale, messages)
    for (let index = 0; index < screenIndex; index += 1) press(flow.continue)
    skipIntro(messages)
    expect(heading()).toBe(flow.what.title)
    cleanup()
    mount(locale, messages)
    expect(heading()).toBe(flow.what.title)
  })

  it('walks back through the intro and from the first question to the last intro screen', () => {
    mount(locale, messages)
    expect(screen.queryByRole('button', { name: flow.back })).toBeNull()
    press(flow.continue)
    press(flow.continue)
    press(flow.continue)
    press(flow.back)
    expect(heading()).toBe(guided.intro.restart.title)
  })

  it('goes from a phrase with a schedule and a time straight to the summary, counting only the steps that remain', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    expect(progress()).toBe(guided.progress.replace('{position}', '1').replace('{total}', '3'))
    expect(screen.getByText(messages.habits.flow.what.lineEmpty)).toBeInTheDocument()
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    expect(heading()).toBe(guided.summary.question)
    expect(progress()).toBe(guided.progress.replace('{position}', '2').replace('{total}', '3'))
    expect(screen.getByRole('group', { name: guided.summary.question })).toHaveTextContent(/6:00\sPM|18:00/)
  })

  it('asks how it repeats when the phrase has no schedule, then the days, then the summary', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    expect(heading()).toBe(flow.when.scheduleMode)
    expect(progress()).toBe(guided.progress.replace('{position}', '2').replace('{total}', '4'))
    press(guided.mode.fixed)
    expect(heading()).toBe(flow.when.daysLabel)
    expect(progress()).toBe(guided.progress.replace('{position}', '3').replace('{total}', '5'))
    press(guided.days.everyDay)
    expect(heading()).toBe(guided.summary.question)
    press(flow.back)
    expect(heading()).toBe(flow.when.daysLabel)
  })

  it('fills the phrase and advances in one press of a starter', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await act(async () => { press(flow.what.starterLabels.walk) })
    expect(heading()).toBe(guided.summary.question)
    expect(screen.getByRole('group', { name: guided.summary.question })).toHaveTextContent(flow.what.starters.walk.split(' ')[0]!)
  })

  it('opens the step of a summary value and returns to the summary with the answer', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday' : 'Caminhar toda segunda')
    fireEvent.click(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: new RegExp(guided.summary.time) }))
    expect(heading()).toBe(guided.time.question)
    press(guided.time.none)
    expect(heading()).toBe(guided.summary.question)
    fireEvent.click(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: new RegExp(guided.summary.time) }))
    fireEvent.click(screen.getByRole('button', { name: /^(8:00\sAM|08:00)$/ }))
    expect(heading()).toBe(guided.summary.question)
    expect(screen.getByRole('group', { name: guided.summary.question })).toHaveTextContent(/8:00\sAM|08:00/)
  })

  it('shows the hint beside the field on an empty submit and stays on the phrase', () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    press(flow.continue)
    expect(heading()).toBe(flow.what.title)
    expect(screen.getByText(flow.what.continueReason)).toBeInTheDocument()
  })

  it('keeps the typed habit on the summary after a failed create, offers retry, and opens no dialog', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mocks.createHabit.mockRejectedValueOnce(new Error('offline'))
    mount(locale, messages)
    const phrase = locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00'
    await typePhrase(messages, phrase)
    await act(async () => { press(flow.create) })
    expect(heading()).toBe(guided.summary.question)
    expect(screen.getByRole('alert')).toHaveTextContent(flow.createFailed)
    expect(screen.getByRole('button', { name: flow.retry })).toBeInTheDocument()
    expect(document.querySelector('[data-result-dialog]')).toBeNull()
    const expected = buildOnboardingHabitInput({ sentence: phrase, locale, emoji: '', reminderEnabled: false, schedule: buildOnboardingScheduleFromPhrase(phrase, locale) })
    expect(mocks.createHabit).toHaveBeenCalledWith(expected)
    await act(async () => { press(flow.retry) })
    expect(mocks.createHabit).toHaveBeenCalledTimes(2)
    expect(heading()).toMatch(new RegExp(guided.remind.question.replace('{time}', '(5:45\\sPM|17:45)').replace('?', '\\?')))
  })

  it('asks for reminders with two quick options: allow asks the device once, not now asks nothing', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    expect(screen.getByText(guided.remind.line)).toBeInTheDocument()
    expect(screen.getByText(flow.remind.notificationBody)).toBeInTheDocument()
    await act(async () => { press(flow.remind.deny) })
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
    cleanup()
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(guided.remind.allow) })
    expect(mocks.subscribe).toHaveBeenCalledTimes(1)
    expect(mocks.updateHabit).toHaveBeenLastCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true, reminderTimes: [15] }))
  })

  it('closes with the result dialog built from the saved habit, then opens Today on a Pro plan', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.deny) })
    const dialog = await screen.findByRole('dialog', { name: messages.result.title })
    expect(dialog.querySelector('[data-orbit-state="feliz"]')).not.toBeNull()
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(/6:00\sPM|18:00/))
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(locale === 'en' ? /every Monday/ : /segunda/))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.result.seeToday })).toHaveFocus())
    expect(mocks.completed).toHaveBeenCalledWith('onboarding', 3, false)
    await act(async () => { press(messages.result.seeToday) })
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('follows the dialog with the Pro step on the free plan', async () => {
    mocks.plan = 'Free'
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.deny) })
    await act(async () => { press(messages.result.seeToday) })
    expect(screen.getByTestId('pro-step')).toBeInTheDocument()
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
  })

  it('opens the login URL from the account link before sign-in', () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages, { isLive: false })
    press(flow.what.haveAccount)
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/login'))
  })
})

describe('guided onboarding requests', () => {
  it('sends the suggestion the same body as the current flow and marks the proposed values', async () => {
    mocks.suggestionAvailable = true
    mocks.suggest.mockResolvedValue({ emoji: '🚶', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], dueTime: '07:00', isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [] })
    useOnboardingDraftStore.setState({ introSeen: true })
    mount('en', en)
    await typePhrase(en, 'Walk')
    expect(mocks.suggest).toHaveBeenCalledWith({ title: 'Walk', language: 'en' })
    expect(heading()).toBe(en.onboarding.flow.guided.summary.question)
    expect(screen.getByRole('group', { name: en.onboarding.flow.guided.summary.question })).toHaveTextContent('🚶')
  })

  it('shows Orbit in Pensando while the model reads the phrase', async () => {
    mocks.suggestionAvailable = true
    let resolve!: (value: unknown) => void
    mocks.suggest.mockReturnValue(new Promise((done) => { resolve = done }))
    useOnboardingDraftStore.setState({ introSeen: true })
    mount('en', en)
    await typePhrase(en, 'Walk')
    expect(document.querySelector('[data-question-flow]')?.getAttribute('data-orbit-state')).toBe('pensando')
    expect(document.querySelector('[data-question-flow] > [role="status"]')).toHaveTextContent(en.habits.flow.what.reading)
    await act(async () => { resolve({ emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], dueTime: null, isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [] }) })
  })
})

describe.each([false, true])('guided onboarding motion with reduced motion %s', (reducedMotion) => {
  it('keeps the same intro text and drops every animation under reduced motion', () => {
    stubMedia(reducedMotion)
    mount('en', en)
    const sentence = document.querySelector<HTMLElement>('[data-intro-sentence]')!
    expect(sentence).toHaveTextContent(en.onboarding.flow.guided.intro.talk.body)
    expect(sentence.style.opacity).toBe(reducedMotion ? '1' : '0')
    expect(document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-loop')).toBe(reducedMotion ? 'still' : document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-loop'))
  })
})

it('renders the current onboarding with the flag off', () => {
  mount('en', en, { guided: false })
  expect(document.querySelector('[data-question-flow]')).toBeNull()
  expect(screen.getByRole('heading', { name: en.onboarding.flow.what.title })).toBeInTheDocument()
  expect(screen.queryByText(en.onboarding.flow.guided.intro.talk.title)).toBeNull()
})
