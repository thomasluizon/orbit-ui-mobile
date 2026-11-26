import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { holdAccount } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({
  isLive: true, profileAvailable: true, timeZone: 'UTC' as string | null,
  createHabit: vi.fn(), updateHabit: vi.fn(), finishOnboarding: vi.fn(), refetchProfile: vi.fn(), updateTimezone: vi.fn(),
  saved: undefined as Record<string, unknown> | undefined,
}))

vi.mock('next/navigation', async (importOriginal) => ({ ...await importOriginal<typeof import('next/navigation')>(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mocks.profileAvailable ? { timeZone: mocks.timeZone, aiMessagesLimit: 5, aiMessagesUsed: 0, hasProAccess: true, isTrialActive: false, isLifetimePro: true, trialEndsAt: null, planExpiresAt: '2999-01-01T00:00:00Z' } : undefined,
    refetch: mocks.refetchProfile,
  }),
}))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: false, mutateAsync: vi.fn(), verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => ({ supported: true, permission: 'default', status: 'not-registered' }),
  subscribeToPushNotifications: vi.fn(),
  requestWebPushPermission: vi.fn(),
}))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: mocks.updateTimezone }))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => <p data-testid="pro-step">pro</p> }))
vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: ({ dueToday, general }: { dueToday: boolean; general: boolean }) => <div data-testid="done" data-due-today={String(dueToday)} data-general={String(general)} />,
}))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({ ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(), useHabitDetail: (id: string | null) => ({ data: id ? mocks.saved : undefined }) }))
vi.mock('@/components/onboarding/onboarding-actions-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/onboarding/onboarding-actions-context')>(),
  useLiveOnboardingActions: () => actions(),
}))

import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const flow = en.onboarding.flow
const originalTimeZone = process.env.TZ

function actions(): OnboardingActions {
  return {
    createHabit: mocks.createHabit, updateHabit: mocks.updateHabit, createHabitsBulk: vi.fn(), logHabit: vi.fn(), createGoal: vi.fn(),
    setWeekStartDay: vi.fn(), deferPushRegistration: vi.fn(), recordCompletion: vi.fn(), finishOnboarding: mocks.finishOnboarding,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <OnboardingActionsProvider actions={actions()} isLive={mocks.isLive}><OnboardingFlow /></OnboardingActionsProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

async function createHabitFrom(phrase: string) {
  mount()
  fireEvent.change(screen.getByLabelText(flow.guided.what.question, { selector: 'textarea' }), { target: { value: phrase } })
  await act(async () => { press(flow.continue) })
  await act(async () => { press(flow.create) })
}

async function reachDone(phrase: string, decision: string) {
  await createHabitFrom(phrase)
  expect(screen.getByText(flow.guided.remind.line)).toBeInTheDocument()
  await act(async () => { press(decision) })
  await waitFor(() => expect(screen.getByTestId('done')).toBeInTheDocument())
}

const WEEKDAYS = 'Walk every Monday and Thursday at 18:00'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  mocks.isLive = true
  mocks.profileAvailable = true
  mocks.timeZone = 'UTC'
  mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
  mocks.updateHabit.mockResolvedValue(undefined)
  mocks.finishOnboarding.mockResolvedValue(undefined)
  mocks.updateTimezone.mockResolvedValue(undefined)
  mocks.saved = { id: 'habit-1', frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueDate: '2026-11-16', dueTime: '18:00:00' }
  useOnboardingDraftStore.setState({ introSeen: true, onboardingLocallyDone: false, habits: [] })
  holdAccount('user-1')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('guided onboarding saves the habit in the account day', () => {
  it('waits for the profile timezone before it saves a signed-in habit', async () => {
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: { timeZone: 'America/Sao_Paulo' } })
    await createHabitFrom(WEEKDAYS)
    expect(mocks.refetchProfile).toHaveBeenCalledOnce()
    expect(mocks.createHabit).toHaveBeenCalledOnce()
    expect(mocks.refetchProfile.mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
  })

  it('keeps the habit unsaved when the profile never loads', async () => {
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: undefined })
    await createHabitFrom(WEEKDAYS)
    expect(mocks.createHabit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(flow.createFailed)
  })

  it('sets a loaded null timezone before it creates the habit', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    mocks.timeZone = null
    await createHabitFrom(WEEKDAYS)
    expect(mocks.updateTimezone).toHaveBeenCalledWith({ timeZone: 'America/Sao_Paulo' }, 'user-1')
    expect(mocks.updateTimezone.mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
  })

  it('leaves a loaded timezone alone', async () => {
    mocks.timeZone = 'America/Sao_Paulo'
    await createHabitFrom(WEEKDAYS)
    expect(mocks.updateTimezone).not.toHaveBeenCalled()
    expect(mocks.createHabit).toHaveBeenCalledOnce()
  })
})

describe('guided onboarding tells the done screen if the habit is due today', () => {
  it('says a weekday habit that skips today is not in the day', async () => {
    vi.setSystemTime(new Date(2026, 8, 16))
    mocks.isLive = false
    await reachDone(WEEKDAYS, flow.remind.deny)
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
    expect(screen.getByTestId('done')).toHaveAttribute('data-general', 'false')
  })

  it.each([
    ['UTC', '2026-09-14T02:00:00.000Z', 'America/Sao_Paulo', false],
    ['America/Sao_Paulo', '2026-09-14T00:30:00.000Z', 'UTC', true],
  ])('uses the %s device at %s with the %s profile weekday', async (deviceTimeZone, instant, profileTimeZone, dueToday) => {
    process.env.TZ = deviceTimeZone
    vi.setSystemTime(new Date(instant))
    mocks.timeZone = profileTimeZone
    await reachDone('Walk every Monday at 18:00', flow.remind.deny)
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', String(dueToday))
  })

  it('reads the weekday in the timezone the profile loads after the wait', async () => {
    process.env.TZ = 'UTC'
    vi.setSystemTime(new Date('2026-09-14T02:00:00.000Z'))
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: { timeZone: 'America/Sao_Paulo' } })
    await reachDone('Walk every Monday at 18:00', flow.remind.deny)
    expect(mocks.refetchProfile).toHaveBeenCalledOnce()
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
  })

  it('reads the weekday in the device timezone it sets for a null profile timezone', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    mocks.timeZone = null
    await reachDone('Walk every Monday at 18:00', flow.remind.deny)
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
  })

  it('never says a habit with no day is in the day', async () => {
    mocks.isLive = false
    mount()
    fireEvent.change(screen.getByLabelText(flow.guided.what.question, { selector: 'textarea' }), { target: { value: 'Meditate at 07:00' } })
    await act(async () => { press(flow.continue) })
    press(flow.guided.mode.fixed)
    press(flow.continue)
    await act(async () => { press(flow.create) })
    await act(async () => { press(flow.remind.continue) })
    await waitFor(() => expect(screen.getByTestId('done')).toBeInTheDocument())
    expect(screen.getByTestId('done')).toHaveAttribute('data-due-today', 'false')
    expect(screen.getByTestId('done')).toHaveAttribute('data-general', 'true')
  })
})
