import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

const mocks = vi.hoisted(() => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  finishOnboarding: vi.fn(),
  suggest: vi.fn(),
  subscribe: vi.fn(),
  requestPermissionOnly: vi.fn(),
  profile: { aiMessagesLimit: 5, aiMessagesUsed: 0 },
  push: { supported: true, permission: 'default', status: 'not-registered' },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
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
vi.mock('@/components/shell/shell-412', () => ({ Shell412: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/shell/shell-wide', () => ({ ShellWide: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/navigation/bottom-tab-bar', () => ({ BottomTabBar: () => null }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) => <button type="button" disabled={disabled || loading} onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/quiet-link', () => ({ QuietLink: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button type="button" onClick={onClick}>{children}</button> }))
vi.mock('@/components/ui/toast', () => ({ Toast: ({ message }: { message: string }) => <div>{message}</div> }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => <input aria-label="sentence" value={sentence} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ proposed, onToggleDay, onTimeChange }: { proposed: boolean; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }) => <div data-testid="schedule" data-proposed={proposed}><button type="button" onClick={() => onToggleDay('Monday')}>Monday</button><input aria-label="time" onChange={(event) => onTimeChange(event.target.value)} /></div>,
}))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: ({ state }: { state: string }) => <div data-testid="reminder-state">{state}</div> }))
vi.mock('@/components/onboarding/onboarding-complete', () => ({ OnboardingComplete: () => <div data-testid="done" /> }))

function actions(): OnboardingActions {
  return {
    createHabit: mocks.createHabit,
    updateHabit: mocks.updateHabit,
    createHabitsBulk: vi.fn(),
    logHabit: vi.fn(),
    createGoal: vi.fn(),
    setWeekStartDay: vi.fn(),
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

describe('OnboardingFlow state model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile.aiMessagesUsed = 0
    mocks.push.supported = true
    mocks.push.permission = 'default'
    mocks.push.status = 'not-registered'
    mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
    mocks.subscribe.mockResolvedValue({ supported: true, subscribed: true, permission: 'granted', status: 'registered' })
    mocks.requestPermissionOnly.mockResolvedValue('granted')
  })

  it('keeps one counter across three decisions and the done state', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingNextStep(ONBOARDING_REMIND_STEP)).toBe(ONBOARDING_DONE_STEP)
    expect(shouldHideOnboardingFooter(ONBOARDING_REMIND_STEP)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_DONE_STEP)).toBe(true)
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

  it.each([true, false])('removes Skip after a habit exists when isLive=%s', async (isLive) => {
    await reachReminder(isLive)
    expect(screen.queryByRole('button', { name: 'skip' })).toBeNull()
  })

  it('asks for browser permission on the signed-out path', async () => {
    await reachReminder(false)
    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    await waitFor(() => expect(mocks.requestPermissionOnly).toHaveBeenCalledOnce())
  })

  it('shows a denied permission outcome instead of reporting success', async () => {
    mocks.subscribe.mockResolvedValue({ supported: true, subscribed: false, permission: 'denied', status: 'denied' })
    await reachReminder(true)
    fireEvent.click(screen.getByRole('button', { name: 'remind.allow' }))
    expect(await screen.findByTestId('reminder-state')).toHaveTextContent('denied')
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
  })
})
