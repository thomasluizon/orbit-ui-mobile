import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const mocks = vi.hoisted(() => {
  const profile: { aiMessagesLimit: number; aiMessagesUsed: number; timeZone: string | null } = {
    aiMessagesLimit: 5, aiMessagesUsed: 0, timeZone: 'UTC',
  }
  return {
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    finishOnboarding: vi.fn(),
    suggest: vi.fn(),
    subscribe: vi.fn(),
    requestPermissionOnly: vi.fn(),
    navigate: vi.fn(),
    refetchProfile: vi.fn(),
    updateTimezone: vi.fn(),
    profileAvailable: true,
    profile,
    push: { supported: true, permission: 'default', status: 'not-registered' },
  }
})

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.navigate }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profileAvailable ? mocks.profile : undefined, refetch: mocks.refetchProfile }) }))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: mocks.updateTimezone }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mocks.suggest, isPending: false }),
}))
vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => mocks.push,
  subscribeToPushNotifications: mocks.subscribe,
  requestWebPushPermission: mocks.requestPermissionOnly,
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ header, action, notice, children }: { header: React.ReactNode; action: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) => <div>{header}{notice}{children}{action}</div>,
}))
vi.mock('@/components/shell/shell-412', () => ({ Shell412: ({ tabBar, children }: { tabBar?: React.ReactNode; children: React.ReactNode }) => <div>{children}{tabBar}</div> }))
vi.mock('@/components/shell/shell-wide', () => ({ ShellWide: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/navigation/bottom-tab-bar', () => ({ BottomTabBar: ({ items, onSelect }: { items: { id: string; label: string }[]; onSelect: (id: string) => void }) => <nav>{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)}>{item.label}</button>)}</nav> }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) => <button type="button" disabled={disabled || loading} onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/quiet-link', () => ({ QuietLink: ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={onClick}>{children}</button> }))
vi.mock('@/components/ui/toast', () => ({ Toast: ({ message }: { message: string }) => <div>{message}</div> }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => <input aria-label="sentence" value={sentence} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ proposed, schedule, canSaveRepeatWeeks, onToggleDay, onTimeChange }: { proposed: boolean; schedule: { intervalWeeks: number }; canSaveRepeatWeeks: boolean; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }) => <div data-testid="schedule" data-proposed={proposed} data-can-save-repeat-weeks={String(canSaveRepeatWeeks)} data-interval-weeks={String(schedule.intervalWeeks)}><button type="button" onClick={() => onToggleDay('Monday')}>Monday</button><input aria-label="time" onChange={(event) => onTimeChange(event.target.value)} /></div>,
}))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: ({ state }: { state: string }) => <div data-testid="reminder-state">{state}</div> }))
vi.mock('@/components/onboarding/onboarding-complete', () => ({ OnboardingComplete: ({ dueToday, general, onFinish }: { dueToday: boolean; general: boolean; onFinish: () => void }) => <div data-testid="done" data-due-today={String(dueToday)} data-general={String(general)}><button type="button" onClick={onFinish}>finish</button></div> }))

function actions(): OnboardingActions {
  return {
    createHabit: mocks.createHabit,
    updateHabit: mocks.updateHabit,
    createHabitsBulk: vi.fn(),
    logHabit: vi.fn(),
    createGoal: vi.fn(),
    setWeekStartDay: vi.fn(),
    deferPushRegistration: vi.fn(),
    finishOnboarding: mocks.finishOnboarding,
  }
}

function mount(isLive: boolean) {
  return render(<OnboardingActionsProvider actions={actions()} isLive={isLive}><OnboardingFlow /></OnboardingActionsProvider>)
}

async function reachReminder(isLive: boolean) {
  if (isLive) mocks.profile.aiMessagesUsed = mocks.profile.aiMessagesLimit
  mount(isLive)
  fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'continue' }))
  fireEvent.click(await screen.findByRole('button', { name: 'create' }))
  await screen.findByTestId('reminder-state')
}

const COUNTER_PATTERN = /^Orbit \d{2} \/ \d{2}$/
const originalTimeZone = process.env.TZ

function isCounter(element: Element | null): boolean {
  return element?.tagName === 'SPAN' && COUNTER_PATTERN.test(String(element.textContent))
}

function headerCounter(): string {
  return String(screen.getByText((_, element) => isCounter(element)).textContent)
}

async function reachDone(isLive: boolean) {
  await reachReminder(isLive)
  fireEvent.click(screen.getByRole('button', { name: 'remind.deny' }))
  await screen.findByTestId('done')
}

describe('OnboardingFlow state model', () => {
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocks.profile.aiMessagesUsed = 0
    mocks.profile.timeZone = 'UTC'
    mocks.profileAvailable = true
    mocks.refetchProfile.mockResolvedValue({ data: mocks.profile })
    mocks.updateTimezone.mockResolvedValue(undefined)
    mocks.push.supported = true
    mocks.push.permission = 'default'
    mocks.push.status = 'not-registered'
    mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
    mocks.subscribe.mockResolvedValue({ supported: true, subscribed: true, permission: 'granted', status: 'registered' })
    mocks.requestPermissionOnly.mockResolvedValue('granted')
    useOnboardingDraftStore.getState().reset()
  })

  it('never shows or saves a repeat interval a signed-out draft cannot carry', async () => {
    mount(false)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Clean every 3 weeks on Monday' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    const screenProps = screen.getByTestId('schedule')
    expect(screenProps).toHaveAttribute('data-can-save-repeat-weeks', 'false')
    expect(screenProps).toHaveAttribute('data-interval-weeks', '1')
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ intervalWeeks: 1, days: ['Monday'] })))
  })

  it('keeps the repeat interval for a signed-in run, which saves it', async () => {
    mocks.profile.aiMessagesUsed = mocks.profile.aiMessagesLimit
    mount(true)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Clean every 3 weeks on Monday' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(screen.getByTestId('schedule')).toHaveAttribute('data-can-save-repeat-weeks', 'true')
    expect(screen.getByTestId('schedule')).toHaveAttribute('data-interval-weeks', '3')
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ intervalWeeks: 3 })))
  })

  it('never offers a reminder to a habit with no day of its own', async () => {
    mount(false)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Meditate at 07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    expect(await screen.findByTestId('reminder-state')).toHaveTextContent('no-day')
    expect(screen.queryByRole('button', { name: 'remind.allow' })).toBeNull()
    expect(screen.getByRole('button', { name: 'remind.setDays' })).toBeInTheDocument()
  })

  it('tells the done screen a weekday habit that skips today is not in the day', async () => {
    vi.setSystemTime(new Date(2026, 8, 16))
    mount(false)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday and Thursday at 18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByTestId('reminder-state')
    fireEvent.click(screen.getByRole('button', { name: 'remind.deny' }))
    await waitFor(() => expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false'))
    expect(screen.getByTestId('done')).toHaveAttribute('data-general', 'false')
  })

  it.each([
    ['UTC', '2026-09-14T02:00:00.000Z', 'America/Sao_Paulo', false],
    ['America/Sao_Paulo', '2026-09-14T00:30:00.000Z', 'UTC', true],
  ])('uses the %s device at %s with the %s profile weekday', async (deviceTimeZone, instant, profileTimeZone, dueToday) => {
    process.env.TZ = deviceTimeZone
    vi.setSystemTime(new Date(instant))
    mocks.profile.timeZone = profileTimeZone
    await reachDone(true)
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', String(dueToday))
  })

  it('waits for the profile timezone before saving a signed-in habit', async () => {
    process.env.TZ = 'UTC'
    vi.setSystemTime(new Date('2026-09-14T02:00:00.000Z'))
    mocks.profile.timeZone = 'America/Sao_Paulo'
    mocks.profileAvailable = false
    await reachDone(true)
    expect(mocks.refetchProfile).toHaveBeenCalledOnce()
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
  })

  it('sets a loaded null timezone before creating in the device account day', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    mocks.profile.timeZone = null
    await reachDone(true)
    expect(mocks.updateTimezone).toHaveBeenCalledWith({ timeZone: 'America/Sao_Paulo' })
    expect(mocks.updateTimezone.mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
  })

  it('never tells the done screen a habit with no day is in the day', async () => {
    mount(false)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Meditate at 07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    expect(await screen.findByTestId('reminder-state')).toHaveTextContent('no-day')
    fireEvent.click(screen.getByRole('button', { name: 'remind.continue' }))
    await waitFor(() => expect(screen.getByTestId('done')).toBeInTheDocument())
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
    expect(screen.getByTestId('done')).toHaveAttribute('data-general', 'true')
  })

  it('dismisses the overlay directly with Escape', async () => {
    mount(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    expect(screen.queryByLabelText('sentence')).not.toBeInTheDocument()
  })

  it('counts each rendered decision once and drops the counter on the done screen', async () => {
    mount(false)
    expect(headerCounter()).toBe('Orbit 01 / 03')
    expect(screen.getByLabelText('sentence')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Meditate at 07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(headerCounter()).toBe('Orbit 02 / 03')
    expect(screen.getByTestId('schedule')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByTestId('reminder-state')
    expect(headerCounter()).toBe('Orbit 03 / 03')

    fireEvent.click(screen.getByRole('button', { name: 'remind.continue' }))
    await screen.findByTestId('done')
    expect(screen.queryByText((_, element) => isCounter(element))).toBeNull()
  })

  it.each([
    ['calendario', 'nav.calendar', '/calendar'],
    ['hoje', 'nav.today', '/'],
  ])('finishes onboarding and closes the overlay before the %s tab navigates', async (_id, label, route) => {
    await reachDone(true)
    fireEvent.click(screen.getByRole('button', { name: label }))

    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    expect(mocks.navigate).toHaveBeenCalledWith(route)
    await waitFor(() => expect(screen.queryByTestId('done')).toBeNull())
  })

  it('sends a signed-out tab through the sign-in handoff rather than a protected route', async () => {
    await reachDone(false)
    fireEvent.click(screen.getByRole('button', { name: 'nav.calendar' }))

    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    expect(mocks.navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('done')).toBeNull())
  })

  it('finishes onboarding and closes the overlay from the done button', async () => {
    await reachDone(true)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))

    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByTestId('done')).toBeNull())
  })

  it('waits for Astra before exposing schedule actions and persists its flexible cadence', async () => {
    let resolveSuggestion!: (value: HabitSetupSuggestion) => void
    mocks.suggest.mockReturnValue(new Promise<HabitSetupSuggestion>((resolve) => { resolveSuggestion = resolve }))
    mount(true)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk 3 times a week' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(screen.queryByRole('button', { name: 'create' })).toBeNull()
    resolveSuggestion({ emoji: '🚶', frequencyUnit: 'Week', frequencyQuantity: 1, days: [], isFlexible: true, flexibleTarget: 3, dueTime: null, subHabits: [], checklistItems: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({
      frequencyUnit: 'Week', frequencyQuantity: 3, intervalWeeks: 1, isFlexible: true,
    })))
  })

  it.each([
    [{ emoji: '🧾', frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }, {}],
    [{ emoji: '🧹', frequencyUnit: 'Week' as const, frequencyQuantity: 2, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }, { frequencyUnit: 'Week', frequencyQuantity: 2 }],
  ])('persists the exact Astra cadence', async (suggestion, expected) => {
    mocks.suggest.mockResolvedValue(suggestion)
    mount(true)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Astra cadence' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'create' }))
    await waitFor(() => expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining(expected)))
    const request = mocks.createHabit.mock.calls[0]?.[0]
    expect(request).not.toHaveProperty('isGeneral')
    expect(request).not.toHaveProperty('isFlexible')
  })

  it.each([
    ['general', 'Journal'],
    ['flexible', 'Walk 3 times a week at 18:00'],
  ])('sends explicit fixed mode when correcting a %s habit after Back', async (_mode, sentence) => {
    mount(false)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: sentence } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByTestId('reminder-state')

    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    fireEvent.click(screen.getByRole('button', { name: 'create' }))

    await waitFor(() => expect(mocks.updateHabit).toHaveBeenCalledWith(
      'habit-1',
      expect.objectContaining({ isGeneral: false, isFlexible: false }),
    ))
  })

  it.each([true, false])('removes Skip after a habit exists when isLive=%s', async (isLive) => {
    await reachReminder(isLive)
    expect(screen.queryByRole('button', { name: 'skip' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('schedule')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'skip' })).toBeNull()
  })

  it('asks for browser permission on the signed-out path', async () => {
    await reachReminder(false)
    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    await waitFor(() => expect(mocks.requestPermissionOnly).toHaveBeenCalledOnce())
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ reminderEnabled: false }))
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true }))
  })

  it('shows a denied permission outcome instead of reporting success', async () => {
    mocks.subscribe.mockResolvedValue({ supported: true, subscribed: false, permission: 'denied', status: 'denied' })
    await reachReminder(true)
    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    expect(await screen.findByTestId('reminder-state')).toHaveTextContent('denied')
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
    expect(screen.queryByTestId('done')).toBeNull()
  })

  it('does not offer Allow when permission was already refused', async () => {
    mocks.push.permission = 'denied'
    await reachReminder(true)
    expect(screen.getByTestId('reminder-state')).toHaveTextContent('refused')
    expect(screen.queryByRole('button', { name: 'remind.allow' })).toBeNull()
  })

  it('does not offer Allow on an unsupported device', async () => {
    mocks.push.supported = false
    await reachReminder(true)
    expect(screen.getByTestId('reminder-state')).toHaveTextContent('unsupported')
    expect(screen.queryByRole('button', { name: 'remind.allow' })).toBeNull()
  })

  it('keeps registration failure separate from denial', async () => {
    mocks.subscribe.mockRejectedValue(new Error('registration failed'))
    await reachReminder(true)
    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    expect(await screen.findByTestId('reminder-state')).toHaveTextContent('failed')
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })

  it.each([true, false])('persists Not now as reminders off when isLive=%s', async (isLive) => {
    await reachReminder(isLive)
    fireEvent.click(screen.getByRole('button', { name: 'remind.deny' }))
    await waitFor(() => expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false })))
  })

  it('surfaces deferred registration failure after sign-in and retries it', async () => {
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    mount(true)

    expect(screen.getByTestId('reminder-state')).toHaveTextContent('failed')
    expect(screen.queryByRole('button', { name: 'back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
  })

  it('locks both reminder choices until Allow completes', async () => {
    let resolveSubscription!: (value: { supported: true; subscribed: true; permission: 'granted'; status: 'registered' }) => void
    mocks.subscribe.mockReturnValue(new Promise((resolve) => { resolveSubscription = resolve }))
    await reachReminder(true)

    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    const notNow = screen.getByRole('button', { name: 'remind.deny' })
    expect(notNow).toBeDisabled()
    fireEvent.click(notNow)
    expect(mocks.updateHabit).not.toHaveBeenCalled()

    resolveSubscription({ supported: true, subscribed: true, permission: 'granted', status: 'registered' })
    await waitFor(() => expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true })))
    expect(mocks.updateHabit).toHaveBeenCalledOnce()
    expect(await screen.findByTestId('done')).toBeInTheDocument()
  })

  it('keeps header Back inside the pending reminder decision', async () => {
    let resolveSubscription!: (value: { supported: true; subscribed: true; permission: 'granted'; status: 'registered' }) => void
    mocks.subscribe.mockReturnValue(new Promise((resolve) => { resolveSubscription = resolve }))
    await reachReminder(true)

    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    fireEvent.click(screen.getByRole('button', { name: 'back' }))

    expect(screen.getByTestId('reminder-state')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule')).toBeNull()

    resolveSubscription({ supported: true, subscribed: true, permission: 'granted', status: 'registered' })
    expect(await screen.findByTestId('done')).toBeInTheDocument()
  })

  it('clears deferred push recovery before Escape finishes onboarding', async () => {
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    mount(true)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(false)
    expect(useOnboardingDraftStore.getState().habits).toEqual([])
  })
})
