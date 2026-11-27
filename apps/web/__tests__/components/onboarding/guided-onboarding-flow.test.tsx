import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { escapeRegExp } from '@orbit/shared/test-support/escape-reg-exp'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { buildOnboardingHabitInput, buildOnboardingScheduleFromPhrase } from '@orbit/shared/utils'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), completed: vi.fn(), event: vi.fn(), suggest: vi.fn(), subscribe: vi.fn(), requestPermission: vi.fn(),
  createHabit: vi.fn(), updateHabit: vi.fn(), recordCompletion: vi.fn(), finishOnboarding: vi.fn(), deferPush: vi.fn(),
  plan: 'Pro' as 'Pro' | 'Free', pushSupported: true, pushPermission: 'default' as NotificationPermission, online: true, suggestionAvailable: false, flag: false,
  saved: undefined as Record<string, unknown> | undefined,
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
  usePushNotificationPreferences: () => ({ supported: mocks.pushSupported, permission: mocks.pushPermission, status: 'not-registered' }),
  subscribeToPushNotifications: mocks.subscribe,
  requestWebPushPermission: mocks.requestPermission,
}))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: vi.fn() }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: mocks.event }))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => <p data-testid="pro-step">pro</p> }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({ ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(), useHabitDetail: (id: string | null) => ({ data: id ? mocks.saved : undefined }) }))
vi.mock('@/components/onboarding/onboarding-actions-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/onboarding/onboarding-actions-context')>(),
  useLiveOnboardingActions: () => actions(),
}))

import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { motionPresets } from '@orbit/shared/theme'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const SAVED_HABIT = { id: 'habit-1', frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueDate: '2026-11-16', dueTime: '18:30:00' }

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

function mount(locale: string, messages: Messages, options: { isLive?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <OnboardingActionsProvider actions={actions()} isLive={options.isLive ?? true}>
          <OnboardingFlow />
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
  fireEvent.change(screen.getByLabelText(messages.onboarding.flow.guided.what.question, { selector: 'textarea' }), { target: { value: phrase } })
  await act(async () => { press(messages.onboarding.flow.continue) })
}

function skipIntro(messages: Messages) {
  press(messages.onboarding.flow.guided.intro.skip)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.plan = 'Pro'
  mocks.pushSupported = true
  mocks.pushPermission = 'default'
  mocks.requestPermission.mockReset().mockResolvedValue('granted')
  mocks.online = true
  mocks.suggestionAvailable = false
  mocks.flag = false
  mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
  mocks.updateHabit.mockResolvedValue(undefined)
  mocks.recordCompletion.mockResolvedValue(undefined)
  mocks.finishOnboarding.mockResolvedValue(undefined)
  mocks.subscribe.mockResolvedValue({ supported: true, status: 'registered' })
  mocks.saved = SAVED_HABIT
  useOnboardingDraftStore.setState({ introSeen: false, onboardingLocallyDone: false, habits: [] })
  holdAccount('user-1')
  stubMedia(false)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe.each(locales)('guided onboarding in $locale', ({ locale, messages }) => {
  const flow = messages.onboarding.flow
  const guided = flow.guided

  it('explains Orbit on three intro screens before the first question, reaches it in three taps, and offers the header skip there', async () => {
    mount(locale, messages)
    const intros = [guided.intro.talk, guided.intro.routine, guided.intro.restart]
    intros.forEach((intro, index) => {
      expect(heading()).toBe(intro.title)
      expect(screen.getByText(intro.body)).toBeInTheDocument()
      expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', String(index + 1)).replace('{total}', '3'))
      expect(document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state'), `the pose of intro screen ${index}`).toBe('parado')
      expect(screen.getByRole('button', { name: guided.intro.skip })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: flow.skip }), `intro screen ${index} has one skip, and it opens the first question`).toBeNull()
      expect(useOnboardingDraftStore.getState().introSeen, `the intro is not seen on screen ${index}`).toBe(false)
      press(flow.continue)
    })
    expect(heading()).toBe(guided.what.question)
    expect(useOnboardingDraftStore.getState().introSeen).toBe(true)
    expect(screen.getAllByRole('button', { name: flow.skip }), 'the first question has one header skip').toHaveLength(1)
    await act(async () => { press(flow.skip) })
    expect(mocks.recordCompletion, 'the header skip leaves onboarding once').toHaveBeenCalledOnce()
    expect(await screen.findByText(flow.done.skippedTitle)).toBeInTheDocument()
  })

  it.each([0, 1, 2])('skips the intro from screen %i straight to the first question, and never shows it again', (screenIndex) => {
    mount(locale, messages)
    for (let index = 0; index < screenIndex; index += 1) press(flow.continue)
    skipIntro(messages)
    expect(heading()).toBe(guided.what.question)
    cleanup()
    mount(locale, messages)
    expect(heading()).toBe(guided.what.question)
  })

  it.each([0, 1, 2])('shows the intro again from its first screen to a person who quit on screen %i', (screenIndex) => {
    mount(locale, messages)
    for (let index = 0; index < screenIndex; index += 1) press(flow.continue)
    cleanup()
    mount(locale, messages)
    expect(heading()).toBe(guided.intro.talk.title)
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
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '1').replace('{total}', '3'))
    expect(screen.getByText(messages.habits.flow.what.lineEmpty)).toBeInTheDocument()
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    expect(heading()).toBe(guided.summary.question)
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '2').replace('{total}', '3'))
    expect(screen.getByRole('group', { name: guided.summary.question })).toHaveTextContent(/6:00\sPM|18:00/)
  })

  it('answers the phrase question with Enter, as the continue action does', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    const field = () => screen.getByLabelText(guided.what.question, { selector: 'textarea' })
    await act(async () => { fireEvent.keyDown(field(), { key: 'Enter' }) })
    expect(heading()).toBe(guided.what.question)
    expect(screen.getByText(flow.what.continueReason)).toBeInTheDocument()
    fireEvent.change(field(), { target: { value: locale === 'en' ? 'Meditate' : 'Meditar' } })
    await act(async () => { fireEvent.keyDown(field(), { key: 'Enter' }) })
    expect(heading()).toBe(flow.when.scheduleMode)
  })

  it('asks how it repeats when the phrase has no schedule, then the days, then the summary', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    expect(heading()).toBe(flow.when.scheduleMode)
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '2').replace('{total}', '4'))
    press(guided.mode.fixed)
    expect(heading()).toBe(flow.when.daysLabel)
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '3').replace('{total}', '5'))
    press(guided.days.everyDay)
    expect(heading()).toBe(guided.summary.question)
    press(flow.back)
    expect(heading()).toBe(flow.when.daysLabel)
  })

  it('offers the repeat interval on the days step of a live run, moves it by one and stops at MAX_HABIT_INTERVAL_WEEKS', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    press(guided.mode.fixed)
    expect(heading()).toBe(flow.when.daysLabel)
    expect(screen.queryByRole('button', { name: flow.when.intervalMore })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: flow.when.daysLong.monday }))
    const less = screen.getByRole('button', { name: flow.when.intervalLess })
    const more = screen.getByRole('button', { name: flow.when.intervalMore })
    expect(less).toBeDisabled()
    fireEvent.click(more)
    expect(less).toBeEnabled()
    expect(more).toBeEnabled()
    fireEvent.click(less)
    expect(less).toBeDisabled()
    for (let weeks = 1; weeks < MAX_HABIT_INTERVAL_WEEKS; weeks += 1) fireEvent.click(more)
    expect(more).toBeDisabled()
    fireEvent.click(more)
    expect(more).toBeDisabled()
    expect(screen.getByText(String(MAX_HABIT_INTERVAL_WEEKS))).toBeInTheDocument()
  })

  it('hides the repeat interval from a run that cannot save one', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages, { isLive: false })
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    press(guided.mode.fixed)
    expect(heading()).toBe(flow.when.daysLabel)
    fireEvent.click(screen.getByRole('button', { name: flow.when.daysLong.monday }))
    expect(screen.queryByRole('button', { name: flow.when.intervalMore })).toBeNull()
    expect(screen.queryByRole('button', { name: flow.when.intervalLess })).toBeNull()
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

  it('asks the period on its own step before the count, with one quick option for each period and no segmented control', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    press(guided.mode.flexible)
    expect(heading()).toBe(flow.when.frequencyUnitLabel)
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '3').replace('{total}', '6'))
    const periods = within(screen.getByRole('group', { name: flow.when.frequencyUnitLabel })).getAllByRole('button')
    expect(periods.map((option) => option.textContent)).toEqual([flow.when.units.day, flow.when.units.week, flow.when.units.month, flow.when.units.year])
    expect(screen.queryByRole('radiogroup')).toBeNull()
    press(flow.when.units.month)
    expect(heading()).toBe(guided.quantity.question)
    expect(progress()).toBe(messages.habits.flow.progress.replace('{position}', '4').replace('{total}', '6'))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    press(flow.when.quantityMore)
    press(flow.continue)
    expect(heading()).toBe(guided.summary.question)
    press(flow.back)
    expect(heading()).toBe(guided.quantity.question)
    press(flow.back)
    expect(heading()).toBe(flow.when.frequencyUnitLabel)
  })

  it('shows the period as a summary value that opens its own step and returns with the answer', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Meditate' : 'Meditar')
    press(guided.mode.interval)
    press(flow.when.units.week)
    expect(heading()).toBe(guided.interval.question)
    press(flow.continue)
    const summary = () => screen.getByRole('group', { name: guided.summary.question })
    const periodRow = () => within(summary()).getByRole('button', { name: new RegExp(`^${guided.summary.unit}`) })
    expect(periodRow()).toHaveTextContent(flow.when.units.week)
    fireEvent.click(periodRow())
    expect(heading()).toBe(flow.when.frequencyUnitLabel)
    press(flow.when.units.day)
    expect(heading()).toBe(guided.summary.question)
    expect(periodRow()).toHaveTextContent(flow.when.units.day)
    await act(async () => { press(flow.create) })
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 2 }))
  })

  it('has no period value on the summary of a habit with set days', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday' : 'Caminhar toda segunda')
    expect(within(screen.getByRole('group', { name: guided.summary.question })).queryByRole('button', { name: new RegExp(`^${guided.summary.unit}`) })).toBeNull()
  })

  it('shows the emoji as a summary value that opens the emoji picker, and saves the chosen emoji', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    const phrase = locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00'
    await typePhrase(messages, phrase)
    const summary = screen.getByRole('group', { name: guided.summary.question })
    const title = within(summary).getByRole('button', { name: new RegExp(`^${guided.summary.what}`) })
    expect(title.textContent).toBe(`${guided.summary.what}${locale === 'en' ? 'Walk' : 'Caminhar'}`)
    fireEvent.click(within(summary).getByRole('button', { name: messages.habits.form.emojiOpenPicker }))
    const picker = await screen.findByRole('dialog', { name: messages.habits.form.emojiPickerTitle })
    const emoji = within(picker).getAllByRole('option')[0]!
    const chosen = emoji.textContent!
    await act(async () => { fireEvent.click(emoji) })
    await waitFor(() => expect(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: messages.habits.form.emojiOpenPicker })).toHaveTextContent(chosen))
    expect(heading()).toBe(guided.summary.question)
    await act(async () => { press(flow.create) })
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ emoji: chosen }))
  })

  it('shows the hint beside the field on an empty submit and stays on the phrase', () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    press(flow.continue)
    expect(heading()).toBe(guided.what.question)
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
    expect(heading()).toMatch(new RegExp(guided.remind.question.split('{time}').map(escapeRegExp).join('(5:45\\sPM|17:45)')))
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

  it('saves only the created habit on a close after Create, and states a failed save on the step in view', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    const phrase = locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00'
    const created = buildOnboardingHabitInput({ sentence: phrase, locale, emoji: '', reminderEnabled: false, schedule: buildOnboardingScheduleFromPhrase(phrase, locale) })
    await typePhrase(messages, phrase)
    await act(async () => { press(flow.create) })
    press(flow.back)
    expect(heading()).toBe(guided.summary.question)
    fireEvent.click(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: new RegExp(guided.summary.what) }))
    fireEvent.change(screen.getByLabelText(guided.what.question, { selector: 'textarea' }), { target: { value: locale === 'en' ? 'Read every Friday at 07:00' : 'Ler toda sexta às 07:00' } })
    mocks.updateHabit.mockRejectedValueOnce(new Error('offline'))

    await act(async () => { press(flow.skip) })

    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', created)
    expect(heading()).toBe(guided.what.question)
    expect(screen.getByRole('alert')).toHaveTextContent(flow.completionFailed)
    expect(document.querySelector('[data-result-dialog]')).toBeNull()

    await act(async () => { press(flow.skip) })

    expect(mocks.updateHabit).toHaveBeenLastCalledWith('habit-1', created)
    expect(screen.queryByText(flow.completionFailed)).toBeNull()
  })

  const editedPhrase = (name: 'every' | 'once') => locale === 'en'
    ? { every: 'Read every Friday at 07:00', once: 'Read a book' }[name]
    : { every: 'Ler toda sexta às 07:00', once: 'Ler um livro' }[name]
  const openPhraseFromSummary = () => fireEvent.click(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: new RegExp(`^${guided.summary.what}`) }))

  it('returns to the summary when Continue follows a phrase edited from the summary, and reads the new phrase once', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    expect(heading()).toBe(guided.summary.question)
    openPhraseFromSummary()
    expect(heading()).toBe(guided.what.question)
    fireEvent.change(screen.getByLabelText(guided.what.question, { selector: 'textarea' }), { target: { value: editedPhrase('every') } })
    await act(async () => { press(flow.continue) })
    expect(heading()).toBe(guided.summary.question)
    expect(within(screen.getByRole('group', { name: guided.summary.question })).getByRole('button', { name: new RegExp(`^${guided.summary.what}`) }).textContent).toContain(locale === 'en' ? 'Read' : 'Ler')
  })

  it('asks the repeat question when the phrase edited from the summary gave no repeat', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    openPhraseFromSummary()
    fireEvent.change(screen.getByLabelText(guided.what.question, { selector: 'textarea' }), { target: { value: editedPhrase('once') } })
    await act(async () => { press(flow.continue) })
    expect(heading()).toBe(flow.when.scheduleMode)
  })

  it('goes back from a phrase edited from the summary to the summary, before Create and after Create then Back', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    openPhraseFromSummary()
    expect(screen.getByRole('button', { name: flow.back })).toBeInTheDocument()
    press(flow.back)
    expect(heading()).toBe(guided.summary.question)
    await act(async () => { press(flow.create) })
    press(flow.back)
    expect(heading()).toBe(guided.summary.question)
    openPhraseFromSummary()
    press(flow.back)
    expect(heading()).toBe(guided.summary.question)
  })

  it('closes with the result dialog built from the saved habit read back from the query cache, then opens Today on a Pro plan', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.deny) })
    const dialog = await screen.findByRole('dialog', { name: messages.result.title })
    expect(dialog.querySelector('[data-orbit-state="feliz"]')).not.toBeNull()
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(/6:30\sPM|18:30/))
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(locale === 'en' ? /Thursday/ : /quinta/))
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(locale === 'en' ? /11\/16\/2026/ : /16\/11\/2026/))
    expect(dialog).not.toHaveAccessibleDescription(expect.stringMatching(/6:00\sPM|18:00/))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.result.seeToday })).toHaveFocus())
    expect(mocks.completed).toHaveBeenCalledWith('onboarding', 3, false)
    await act(async () => { press(messages.result.seeToday) })
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('opens no result dialog until the saved habit is in the query cache', async () => {
    mocks.saved = undefined
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages)
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.deny) })
    expect(document.querySelector('[data-result-dialog]')).toBeNull()
  })

  it('builds the sentence before sign-in from the habit that waits on this device, and offers sign-in', async () => {
    mocks.createHabit.mockImplementation((input: Parameters<OnboardingActions['createHabit']>[0]) => {
      const index = useOnboardingDraftStore.getState().bufferHabit({ ...input, dueTime: '07:15' })
      return Promise.resolve({ id: String(index), title: input.title })
    })
    useOnboardingDraftStore.setState({ introSeen: true })
    mount(locale, messages, { isLive: false })
    await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.deny) })
    const dialog = await screen.findByRole('dialog', { name: messages.result.title })
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(/7:15\sAM|07:15/))
    expect(dialog).toHaveAccessibleDescription(expect.stringMatching(locale === 'en' ? /Monday/ : /segunda/))
    expect(screen.getByRole('button', { name: flow.done.signIn })).toBeInTheDocument()
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
    const summary = screen.getByRole('group', { name: en.onboarding.flow.guided.summary.question })
    const emojiControl = () => within(screen.getByRole('group', { name: en.onboarding.flow.guided.summary.question })).getByRole('button', { name: en.habits.form.emojiOpenPicker })
    expect(emojiControl()).toHaveTextContent('🚶')
    expect(emojiControl().querySelector('[data-emoji-well]')).toHaveAttribute('data-proposed')
    expect(summary.querySelectorAll('[data-proposed]').length).toBeGreaterThan(1)
    fireEvent.click(emojiControl())
    const picker = await screen.findByRole('dialog', { name: en.habits.form.emojiPickerTitle })
    const other = within(picker).getAllByRole('option').find((option) => option.textContent !== '🚶')!
    await act(async () => { fireEvent.click(other) })
    await waitFor(() => expect(emojiControl()).toHaveTextContent(other.textContent!))
    expect(emojiControl().querySelector('[data-emoji-well]')).not.toHaveAttribute('data-proposed')
  })

  it('keeps the completion failure message on the reminder step', async () => {
    mocks.recordCompletion.mockRejectedValueOnce(new Error('offline'))
    useOnboardingDraftStore.setState({ introSeen: true })
    mount('en', en)
    await typePhrase(en, 'Walk every Monday at 18:00')
    await act(async () => { press(en.onboarding.flow.create) })
    await act(async () => { press(en.onboarding.flow.remind.deny) })
    expect(await screen.findByText(en.onboarding.flow.completionFailed)).toBeInTheDocument()
    expect(document.querySelector('[data-result-dialog]')).toBeNull()
  })

  describe.each(locales)('the reminder outcomes in $locale', ({ locale, messages }) => {
    const flow = messages.onboarding.flow
    const guided = flow.guided
    const remind = flow.remind
    const reachReminder = async (options: { isLive?: boolean } = {}) => {
      useOnboardingDraftStore.setState({ introSeen: true })
      mount(locale, messages, options)
      await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
      await act(async () => { press(flow.create) })
    }
    const reminderWrites = () => mocks.updateHabit.mock.calls.map(([, input]) => (input as { reminderEnabled: boolean }).reminderEnabled)

    it.each([
      ['a denied permission', { supported: true, status: 'denied' }, 'deniedTitle', 'deniedBody'],
      ['a device that cannot register', { supported: false, status: 'unsupported' }, 'unsupportedTitle', 'unsupportedBody'],
      ['a registration that did not finish', { supported: true, status: 'failed' }, 'failedTitle', 'failedBody'],
    ] as const)('states %s on the step, saves the habit with reminders off and never reports success', async (_name, result, titleKey, bodyKey) => {
      mocks.subscribe.mockResolvedValue(result)
      await reachReminder()
      await act(async () => { press(guided.remind.allow) })
      expect(heading()).toBe(remind[titleKey])
      expect(screen.getByText(remind[bodyKey])).toBeInTheDocument()
      expect(mocks.updateHabit).toHaveBeenLastCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
      expect(mocks.recordCompletion).not.toHaveBeenCalled()
      expect(document.querySelector('[data-result-dialog]')).toBeNull()
    })

    it('keeps a registration that throws apart from a denial and offers a retry', async () => {
      mocks.subscribe.mockRejectedValue(new Error('registration failed'))
      await reachReminder()
      await act(async () => { press(guided.remind.allow) })
      expect(heading()).toBe(remind.failedTitle)
      expect(mocks.updateHabit).toHaveBeenLastCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
      mocks.subscribe.mockResolvedValue({ supported: true, status: 'registered' })
      await act(async () => { press(flow.retry) })
      expect(mocks.subscribe).toHaveBeenCalledTimes(2)
      expect(mocks.updateHabit).toHaveBeenLastCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true }))
      expect(mocks.recordCompletion).toHaveBeenCalledOnce()
    })

    it('offers no allow when the device already blocks notifications', async () => {
      mocks.pushPermission = 'denied'
      await reachReminder()
      expect(heading()).toBe(remind.refusedTitle)
      expect(screen.getByText(remind.refusedBody)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: guided.remind.allow })).toBeNull()
    })

    it('offers no allow on a device that cannot receive reminders', async () => {
      mocks.pushSupported = false
      await reachReminder()
      expect(heading()).toBe(remind.unsupportedTitle)
      expect(screen.queryByRole('button', { name: guided.remind.allow })).toBeNull()
    })

    it('registers nothing and defers the push when a signed-out person allows reminders', async () => {
      await reachReminder({ isLive: false })
      await act(async () => { press(guided.remind.allow) })
      expect(mocks.requestPermission).toHaveBeenCalledOnce()
      expect(mocks.subscribe).not.toHaveBeenCalled()
      expect(reminderWrites()).toEqual([true])
      expect(mocks.deferPush).toHaveBeenCalledOnce()
    })

    it.each([
      ['denied', 'deniedTitle', 'deniedSignedOutBody'],
      ['unsupported', 'unsupportedTitle', 'unsupportedSignedOutBody'],
    ] as const)('states a %s permission with the signed-out body and defers nothing', async (outcome, titleKey, bodyKey) => {
      mocks.requestPermission.mockResolvedValue(outcome)
      await reachReminder({ isLive: false })
      await act(async () => { press(guided.remind.allow) })
      expect(heading()).toBe(remind[titleKey])
      expect(screen.getByText(remind[bodyKey])).toBeInTheDocument()
      expect(mocks.deferPush).not.toHaveBeenCalled()
      expect(reminderWrites().at(-1)).toBe(false)
    })
  })

  describe.each(locales)('the retained recovery, the lock and the exit in $locale', ({ locale, messages }) => {
    const flow = messages.onboarding.flow
    const guided = flow.guided
    const remind = flow.remind
    const reachReminder = async () => {
      useOnboardingDraftStore.setState({ introSeen: true })
      mount(locale, messages)
      await typePhrase(messages, locale === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
      await act(async () => { press(flow.create) })
    }
    const deferredFailure = () => useOnboardingDraftStore.setState({ introSeen: true, habits: [{ title: 'Walk', dueTime: '18:00' }], pushPermissionGranted: true, pushRegistrationFailed: true })

    it('states a push registration that failed before sign-in, offers no Back, retries it and finishes onboarding', async () => {
      deferredFailure()
      mount(locale, messages)
      expect(heading()).toBe(remind.failedTitle)
      expect(screen.queryByRole('button', { name: flow.back })).toBeNull()
      await act(async () => { press(flow.retry) })
      expect(mocks.subscribe).toHaveBeenCalledOnce()
      await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
      expect(mocks.updateHabit).not.toHaveBeenCalled()
    })

    it('clears the failed push recovery before Escape finishes onboarding', async () => {
      deferredFailure()
      mount(locale, messages)
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
      expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(false)
      expect(useOnboardingDraftStore.getState().habits).toEqual([])
    })

    it('locks both reminder choices until Allow completes, then saves reminders on once', async () => {
      let resolveSubscription!: (value: { supported: true; status: 'registered' }) => void
      mocks.subscribe.mockReturnValue(new Promise((resolve) => { resolveSubscription = resolve }))
      await reachReminder()
      await act(async () => { press(guided.remind.allow) })
      await act(async () => { press(remind.deny) })
      expect(mocks.updateHabit).not.toHaveBeenCalled()
      await act(async () => { resolveSubscription({ supported: true, status: 'registered' }) })
      await waitFor(() => expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true })))
      expect(mocks.updateHabit).toHaveBeenCalledOnce()
    })

    const doneTarget = (name: string) => [...screen.queryAllByRole('button', { name, hidden: true }), ...screen.queryAllByRole('link', { name, hidden: true })][0]!
    const reachDone = async () => {
      await reachReminder()
      await act(async () => { press(remind.deny) })
      await screen.findByRole('dialog', { name: messages.result.title })
    }

    it('finishes onboarding and opens the Done destination on a Pro plan', async () => {
      mocks.plan = 'Pro'
      const destination = '/calendar'
      const name = messages.nav.calendar
      await reachDone()
      const target = doneTarget(name)
      await act(async () => { fireEvent.click(target) })
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(destination))
      expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    })

    it('keeps the selected Done destination until the final Pro step finishes', async () => {
      mocks.plan = 'Free'
      await reachDone()
      const target = doneTarget(messages.nav.calendar)
      await act(async () => { fireEvent.click(target) })
      expect(await screen.findByTestId('pro-step')).toBeInTheDocument()
      expect(mocks.push).not.toHaveBeenCalled()
      expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    })

    it('ignores Allow while Not now is saving', async () => {
      let resolveUpdate!: () => void
      mocks.updateHabit.mockReturnValue(new Promise<void>((resolve) => { resolveUpdate = resolve }))
      await reachReminder()
      await act(async () => { press(remind.deny) })
      await act(async () => { press(guided.remind.allow) })
      expect(mocks.subscribe).not.toHaveBeenCalled()
      await act(async () => { resolveUpdate() })
      expect(mocks.updateHabit).toHaveBeenCalledOnce()
    })

    it('keeps the header Back inside the pending reminder decision', async () => {
      let resolveSubscription!: (value: { supported: true; status: 'registered' }) => void
      mocks.subscribe.mockReturnValue(new Promise((resolve) => { resolveSubscription = resolve }))
      await reachReminder()
      await act(async () => { press(guided.remind.allow) })
      const back = screen.queryByRole('button', { name: flow.back })
      if (back) fireEvent.click(back)
      expect(heading()).not.toBe(guided.what.question)
      expect(screen.queryByLabelText(guided.what.question, { selector: 'textarea' })).toBeNull()
      await act(async () => { resolveSubscription({ supported: true, status: 'registered' }) })
    })

    it('keeps the overlay until the Escape completion settles, and goes back from the first question instead of leaving', async () => {
      useOnboardingDraftStore.setState({ introSeen: true })
      mount(locale, messages)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(mocks.finishOnboarding).not.toHaveBeenCalled()
      cleanup()
      let finish!: () => void
      mocks.finishOnboarding.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      deferredFailure()
      mount(locale, messages)
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
      expect(dialog).toBeInTheDocument()
      await act(async () => { finish() })
      await waitFor(() => expect(dialog).not.toBeInTheDocument())
      expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    })
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
    const preset = motionPresets['route-push']
    expect(document.querySelector('[data-flow-screen-motion]')?.getAttribute('data-enter-duration')).toBe(String(reducedMotion ? preset.reducedMotion.enterDuration : preset.enterDuration))
    expect(document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-loop')).toBe(reducedMotion ? 'still' : document.querySelector('[data-question-flow] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-loop'))
  })
})

describe('retained onboarding', () => {
  function mountRetained(finalStepOnly: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><RetainedOnboardingOverlay finalStepOnly={finalStepOnly} /></NextIntlClientProvider>
      </QueryClientProvider>,
    )
  }

  it('drops the typed habit when another account replaces the tab', async () => {
    vi.stubGlobal('fetch', vi.fn())
    useOnboardingDraftStore.setState({ introSeen: true })
    mountRetained(false)
    const field = () => screen.getByLabelText(en.onboarding.flow.guided.what.question, { selector: 'textarea' })
    await screen.findByLabelText(en.onboarding.flow.guided.what.question, { selector: 'textarea' })
    fireEvent.change(field(), { target: { value: 'Walk every Monday at 18:00' } })
    expect(field()).toHaveValue('Walk every Monday at 18:00')
    await replaceAccountWith('user-2')
    expect(field()).toHaveValue('')
  })

  it('keeps the final-step-only mode on the Pro step', async () => {
    mocks.flag = true
    mountRetained(true)
    expect(await screen.findByTestId('pro-step')).toBeInTheDocument()
  })
})
