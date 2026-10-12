import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { completeOnboardingOrQueue, useOnboardingCompletionQueue } from '@/hooks/use-onboarding-completion-queue'
import { useRetainedOnboardingGuard, useRetainedOnboardingSession } from '@/hooks/use-retained-onboarding-guard'
import { setOnboardingProPending, useOnboardingProPending } from '@/hooks/use-onboarding-pro-pending'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { runServerAction } from '@/lib/client-action'
import { setApiFetchTranslate } from '@/lib/api-fetch'
import { useVersionGateStore } from '@/stores/version-gate-store'
import React from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Profile } from '@orbit/shared/types/profile'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import { OnboardingActionsProvider, type OnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { RetainedOnboardingOverlay } from '@/components/onboarding/retained-onboarding-overlay'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { setAccountId } from '@/lib/account-scope'
import AuthLayout from '@/app/(auth)/layout'
import OnboardingLayout from '@/app/(onboarding)/layout'
import { useLoginFlow } from '@/app/(auth)/login/use-login-flow'
import { useBufferOnboardingActions } from '@/components/onboarding/onboarding-actions-context'
import { installWebLocks } from '@/__tests__/helpers/web-locks'
import { resetAuthStore } from '@/__tests__/support/account-change'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => {
  const profile = { aiMessagesLimit: 5, aiMessagesUsed: 0, timeZone: 'UTC' as string | null, hasProAccess: true, isTrialActive: false, isLifetimePro: false, trialEndsAt: null as string | null }
  return {
    finalFinish: undefined as (() => Promise<void>) | undefined,
    useRealPush: false,
    isOnline: true,
    useRealShell: false,
    dialogOpenChanges: vi.fn(),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    recordCompletion: vi.fn(),
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
    liveActions: vi.fn(),
  }
})

const NavigationContext = React.createContext({ url: '/', navigate: mocks.navigate as (url: string) => void })

vi.mock('@/components/onboarding/onboarding-actions-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/onboarding/onboarding-actions-context')>()),
  useLiveOnboardingActions: () => mocks.liveActions(),
}))

vi.mock('@base-ui/react/dialog', async (importOriginal) => {
  const { Dialog } = await importOriginal<typeof import('@base-ui/react/dialog')>()
  type RootProps = Omit<React.ComponentProps<typeof Dialog.Root>, 'children'> & { children: React.ReactNode }
  function ObservedDialogRoot(props: RootProps) {
    return <Dialog.Root {...props} onOpenChange={(...args) => {
      mocks.dialogOpenChanges(...args)
      props.onOpenChange?.(...args)
    }}><Dialog.Trigger>reopen onboarding</Dialog.Trigger>{props.children}</Dialog.Root>
  }
  return { Dialog: { ...Dialog, Root: ObservedDialogRoot } }
})

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => { const { navigate } = React.useContext(NavigationContext); return { push: navigate, replace: navigate } }, usePathname: () => new URL(React.useContext(NavigationContext).url, 'https://orbit.test').pathname, useSearchParams: () => new URL(React.useContext(NavigationContext).url, 'https://orbit.test').searchParams }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profileAvailable ? mocks.profile : undefined, refetch: mocks.refetchProfile }) }))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: mocks.updateTimezone }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mocks.suggest, isPending: false }),
}))
vi.mock('@/hooks/use-push-notification-preferences', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-push-notification-preferences')>()
  return {
    usePushNotificationPreferences: () => mocks.useRealPush ? original.usePushNotificationPreferences() : mocks.push,
    subscribeToPushNotifications: mocks.subscribe,
    requestWebPushPermission: mocks.requestPermissionOnly,
  }
})
vi.mock('@/components/shell/flow-shell', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/shell/flow-shell')>()
  return {
  FlowShell: ({ header, action, notice, children }: { header: React.ReactNode; action: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) => mocks.useRealShell ? <original.FlowShell header={header} action={action} notice={notice} mode="onboarding">{children}</original.FlowShell> : <div>{header}{notice}{children}{action}</div>,
  }
})
vi.mock('@/components/shell/shell-wide', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/shell/shell-wide')>()
  return { ShellWide: (props: React.ComponentProps<typeof original.ShellWide> & { tabBar?: React.ReactNode }) => mocks.useRealShell ? <original.ShellWide {...props} /> : <div>{props.children}<div data-shell-notice="">{props.notice}</div>{props.tabBar}</div> }
})
vi.mock('@/components/navigation/bottom-tab-bar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/navigation/bottom-tab-bar')>()
  return { BottomTabBar: (props: React.ComponentProps<typeof original.BottomTabBar>) => mocks.useRealShell ? <original.BottomTabBar {...props} /> : <nav>{props.items.map((item) => <button key={item.id} type="button" onClick={() => props.onSelect(item.id)}>{item.label}</button>)}</nav> }
})
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick, disabled, loading, variant = 'primary', size = 'md', descriptionId }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean; variant?: string; size?: string; descriptionId?: string }) => <button type="button" disabled={disabled || loading} onClick={onClick} data-variant={variant} data-size={size} aria-describedby={descriptionId}>{children}</button>,
}))
vi.mock('@/components/ui/quiet-link', () => ({ QuietLink: ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={onClick}>{children}</button> }))
vi.mock('@/components/ui/toast', () => ({ Toast: ({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) => <div role="status">{message}{actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}</div> }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => <input aria-label="sentence" value={sentence} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ proposed, schedule, canSaveRepeatWeeks, onToggleDay, onTimeChange }: { proposed: boolean; schedule: { intervalWeeks: number }; canSaveRepeatWeeks: boolean; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }) => <div data-testid="schedule" data-proposed={proposed} data-can-save-repeat-weeks={String(canSaveRepeatWeeks)} data-interval-weeks={String(schedule.intervalWeeks)}><button type="button" onClick={() => onToggleDay('Monday')}>Monday</button><input aria-label="time" onChange={(event) => onTimeChange(event.target.value)} /></div>,
}))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: ({ state }: { state: string }) => <div data-testid="reminder-state">{state}</div> }))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: ({ onFinish, ref }: { onFinish: (destination?: string) => Promise<void>; ref?: React.Ref<{ exit: (destination?: string) => void }> }) => {
  mocks.finalFinish = onFinish
  React.useImperativeHandle(ref, () => ({ exit: (destination?: string) => { void onFinish(destination) } }))
  return <div data-testid="pro-step"><button type="button" onClick={() => void onFinish()}>enter-day</button></div>
} }))
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
    recordCompletion: mocks.recordCompletion,
    finishOnboarding: mocks.finishOnboarding,
  }
}

function RetainedRecoverySource({ profile }: Readonly<{ profile: Profile }>) {
  const pendingPro = useOnboardingProPending()
  const completionQueued = useOnboardingCompletionQueue()
  const pushRegistrationFailed = useOnboardingDraftStore((state) => state.pushRegistrationFailed)
  const required = useRetainedOnboardingGuard(profile, completionQueued, pushRegistrationFailed)
  const session = useRetainedOnboardingSession(required || pendingPro)
  const authenticated = useAuthStore((state) => state.isAuthenticated)
  return authenticated && session.open
    ? <RetainedOnboardingOverlay finalStepOnly={pendingPro} onExit={session.dismiss} />
    : <span>destination ready</span>
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

const COUNTER_PATTERN = /^Orbit · \d{2} \/ \d{2}$/
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  beforeEach(() => {
    mocks.useRealPush = false
    mocks.isOnline = true
    mocks.useRealShell = false
    vi.clearAllMocks()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setApiFetchTranslate((key) => key)
    mocks.finishOnboarding.mockReset()
    mocks.recordCompletion.mockReset()
    mocks.suggest.mockReset()
    vi.useRealTimers()
    Object.assign(mocks.profile, createMockProfile({ hasProAccess: true, isTrialActive: false, plan: 'pro' }))
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
    useAppToastStore.setState({ currentToast: null, queue: [] })
    useUIStore.setState({ openOverlayIds: [] })
    mocks.liveActions.mockReturnValue(actions())
  })

  describe('onboarding popup safe-area geometry', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string
    registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([320, 412, 1440].flatMap((width) => ['ltr', 'rtl'].flatMap((direction) =>
      [1, 2, 3].map((step) => ({ width, direction, step, arrowTranslation: direction === 'rtl' ? '-1px' : '1px' })))))(
      'keeps the header ordered at $width on step $step in $direction', async ({ width, direction, step, arrowTranslation }) => {
        mocks.useRealShell = true
        await act(async () => { mount(false) })
        if (step > 1) {
          fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
          fireEvent.click(screen.getByRole('button', { name: 'continue' }))
        }
        if (step === 3) {
          fireEvent.click(screen.getByRole('button', { name: 'create' }))
          await screen.findByTestId('reminder-state')
        }
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          await page.setContent(`<html dir="${direction}"><style>${stylesheet}</style>${screen.getByRole('dialog').outerHTML}</html>`)
          const geometry = await page.evaluate(() => {
            const header = document.querySelector('[data-shell-header]')!
            const counter = [...header.querySelectorAll('span')].find((node) => /^Orbit · \d{2} \/ \d{2}$/.test(node.textContent))!
            const back = header.querySelector('button[aria-label="back"]')
            const bounds = (element: Element) => {
              const rect = element.getBoundingClientRect()
              return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }
            }
            const buttons = [...header.querySelectorAll('button')]
            return { header: bounds(header), counter: bounds(counter), back: back ? bounds(back) : null,
              arrowScale: back ? getComputedStyle(back.querySelector('svg')!).scale : null,
              arrowTranslate: back ? getComputedStyle(back.querySelector('svg')!).translate : null,
              skip: buttons.find((button) => button.textContent === 'skip') ? bounds(buttons.at(-1)!) : null,
              lastLabel: buttons.at(-1)?.textContent }
          })
          expect(geometry.counter.left).toBeGreaterThanOrEqual(geometry.header.left)
          expect(geometry.counter.right).toBeLessThanOrEqual(geometry.header.right)
          if (step === 1) expect(geometry.back).toBeNull()
          else {
            expect(geometry.back!.width).toBe(48)
            expect(geometry.back!.height).toBeGreaterThanOrEqual(48)
            if (direction === 'ltr') expect(geometry.back!.right).toBeLessThanOrEqual(geometry.counter.left)
            else expect(geometry.back!.left).toBeGreaterThanOrEqual(geometry.counter.right)
            expect(geometry.arrowScale).toBe(direction === 'rtl' ? '-1 1' : 'none')
            expect(geometry.arrowTranslate).toBe(arrowTranslation)
          }
          if (step < 3) {
            expect(geometry.lastLabel).toBe('skip')
            if (direction === 'ltr') expect(geometry.skip!.left).toBeGreaterThan(geometry.counter.right)
            else expect(geometry.skip!.right).toBeLessThan(geometry.counter.left)
            expect(geometry.skip!.left).toBeGreaterThanOrEqual(geometry.header.left)
            expect(geometry.skip!.right).toBeLessThanOrEqual(geometry.header.right)
          } else expect(geometry.skip).toBeNull()
        } finally { await page.close() }
      },
    )

    it.each([320, 412, 600].flatMap((width) => [24, 48].flatMap((top) =>
      ['decision', 'done'].map((step) => ({ width, top, step })))))(
      'applies one top inset in the real $step shell at $width with top $top', async ({ width, top, step }) => {
        mocks.useRealShell = true
        if (step === 'done') await reachDone(false)
        else await act(async () => { mount(false) })
        const popup = screen.getByRole('dialog')
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          const session = await page.context().newCDPSession(page)
          await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom: 34, left: 0, right: 0 } })
          await page.setContent(`<style>${stylesheet}</style>${popup.outerHTML}`)
          const geometry = await page.evaluate(() => {
            const shell = document.querySelector('[data-shell="wide"]')!.getBoundingClientRect()
            const header = document.querySelector('[data-shell-header]')?.getBoundingClientRect()
            const scroller = document.querySelector('[data-shell-scroller]')!.getBoundingClientRect()
            const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
            return { shellTop: shell.top, shellBottom: shell.bottom, contentTop: header?.top ?? scroller.top,
              bottom: bottom.bottom, controls: [...document.querySelectorAll('[data-shell-bottom] :is(a[href], button)')]
                .map((control) => control.getBoundingClientRect().bottom) }
          })
          expect(geometry.contentTop).toBe(top)
          expect(geometry.shellTop).toBe(0)
          expect(geometry.shellBottom).toBe(915)
          expect(geometry.bottom).toBe(915)
          expect(geometry.controls.length).toBeGreaterThan(0)
          if (step === 'done') expect(geometry.controls).toHaveLength(4)
          for (const bottom of geometry.controls) expect(bottom).toBeLessThanOrEqual(915 - 34)
        } finally { await page.close() }
      },
    )
  })

  it.each(['suggestion', 'creation'])('announces a stale %s once before onboarding completes', async (operation) => {
    const staleAction = () => runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
    if (operation === 'suggestion') mocks.suggest.mockImplementation(staleAction)
    else {
      mocks.profile.aiMessagesUsed = mocks.profile.aiMessagesLimit
      mocks.createHabit.mockImplementation(staleAction)
    }
    render(<RetainedOnboardingOverlay />)
    const dialog = screen.getByRole('dialog')
    const region = dialog.querySelector('[data-update-live-region]')
    expect(region).toBeEmptyDOMElement()
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'continue' })) })
    if (operation === 'creation') {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'create' })) })
    }
    expect(region).toHaveTextContent('errors.api.appUpdated')
    expect(screen.getAllByText('errors.api.appUpdated')).toHaveLength(1)
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'errors.api.reload' }))
    expect(screen.queryByTestId('done')).not.toBeInTheDocument()
  })

  it.each([true, false])('announces a stale finish once in onboarding when isLive=%s', async (isLive) => {
    await reachDone(isLive)
    const dialog = screen.getByRole('dialog')
    const region = dialog.querySelector('[data-update-live-region]')
    expect(region).toBeEmptyDOMElement()
    mocks.finishOnboarding.mockImplementation(() => runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action'))))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'finish' })) })
    expect(region).toHaveTextContent('errors.api.appUpdated')
    expect(screen.getAllByText('errors.api.appUpdated')).toHaveLength(1)
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'errors.api.reload' }))
  })

  it('ignores a dialog open request after onboarding has completed', async () => {
    await reachDone(true)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await waitFor(() => expect(screen.queryByTestId('done')).toBeNull())
    mocks.dialogOpenChanges.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'reopen onboarding' }))
    expect(mocks.dialogOpenChanges).toHaveBeenCalledWith(true, expect.anything())
    expect(screen.queryByTestId('done')).toBeNull()
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
  })

  it('keeps Reload reachable inside the done dialog when finishing fails', async () => {
    const reload = vi.fn()
    mocks.finishOnboarding.mockImplementation(async () => {
      useAppToastStore.getState().showToast({
        kind: 'neutral', message: 'Account changed', actionLabel: 'Reload', onAction: reload,
      })
      throw Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED', status: 409 })
    })
    await reachDone(false)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))

    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog.querySelector('[role="status"]:not([data-update-live-region])')).toHaveTextContent('Account changed'))
    const action = screen.getByRole('button', { name: 'Reload' })
    act(() => { fireEvent.click(action) })
    expect(reload).toHaveBeenCalledOnce()
    expect(dialog.querySelector('[role="status"]:not([data-update-live-region])')).toBeNull()
    expect(dialog).toBeInTheDocument()
  })

  it('drops the typed habit when another account replaces the tab', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    render(<RetainedOnboardingOverlay />)
    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
    expect(screen.getByLabelText('sentence')).toHaveValue('Walk every Monday at 18:00')

    await replaceAccountWith('user-2')

    expect(screen.getByLabelText('sentence')).toHaveValue('')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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
    holdAccount('user-1')
    await reachDone(true)
    expect(mocks.updateTimezone).toHaveBeenCalledWith({ timeZone: 'America/Sao_Paulo' }, 'user-1')
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

  it('shows the flushed final step once and clears only its account flag', async () => {
    holdAccount('account-1')
    setOnboardingProPending('account-1', true)
    setOnboardingProPending('account-2', true)
    function PendingHost() {
      return useOnboardingProPending() ? <RetainedOnboardingOverlay finalStepOnly /> : null
    }
    render(<PendingHost />)
    await screen.findByTestId('pro-step')
    expect(screen.queryByTestId('done')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'enter-day' }))
    await waitFor(() => expect(screen.queryByTestId('pro-step')).not.toBeInTheDocument())
    expect(localStorage.getItem('orbit_onboarding_pro_pending:account-1')).toBeNull()
    expect(localStorage.getItem('orbit_onboarding_pro_pending:account-2')).toBe('1')
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
  })

  it('rejects final completion when the server detects another held account', async () => {
    mocks.profile.hasProAccess = false
    mocks.finishOnboarding.mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED', status: 409 }))
    mount(true)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await screen.findByTestId('done')
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await screen.findByTestId('pro-step')
    await expect(mocks.finalFinish!()).rejects.toThrow('Account changed')
    expect(screen.getByTestId('pro-step')).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it.each(['trial', 'free'])('Escape preserves the final %s ending from a decision', async (plan) => {
    Object.assign(mocks.profile, createMockProfile({ hasProAccess: plan === 'trial', isTrialActive: plan === 'trial', isLifetimePro: false }))
    mount(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await screen.findByTestId('done')
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await screen.findByTestId('pro-step')
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
  })

  it.each(['trial', 'free'])('Skip reaches Done then the final %s step before completion', async (plan) => {
    Object.assign(mocks.profile, createMockProfile({ hasProAccess: plan === 'trial', isTrialActive: plan === 'trial', isLifetimePro: false }))
    mount(true)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await screen.findByTestId('done')
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await screen.findByTestId('pro-step')
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'enter-day' }))
    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
  })

  it('keeps the selected Done tab until the final step finishes', async () => {
    mocks.profile.hasProAccess = false
    await reachDone(true)
    fireEvent.click(screen.getByRole('button', { name: 'nav.calendar' }))
    await screen.findByTestId('pro-step')
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'enter-day' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/calendar'))
  })

  it('counts each rendered decision once and drops the counter on the done screen', async () => {
    mount(false)
    expect(headerCounter()).toBe('Orbit · 01 / 03')
    expect(screen.getByText('Orbit')).toHaveAttribute('translate', 'no')
    expect(screen.getByLabelText('sentence')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Meditate at 07:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(headerCounter()).toBe('Orbit · 02 / 03')
    expect(screen.getByTestId('schedule')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByTestId('reminder-state')
    expect(headerCounter()).toBe('Orbit · 03 / 03')

    fireEvent.click(screen.getByRole('button', { name: 'remind.continue' }))
    await screen.findByTestId('done')
    expect(screen.queryByText((_, element) => isCounter(element))).toBeNull()
  })

  it('explains the empty continue action and moves the account action into the signed-out stack', () => {
    mount(false)
    const continueButton = screen.getByRole('button', { name: 'continue' })
    const reason = screen.getByText('what.continueReason')
    const accountButton = screen.getByRole('button', { name: 'what.haveAccount' })
    expect(continueButton).toBeDisabled()
    expect(continueButton).toHaveAttribute('aria-describedby', reason.id)
    expect(reason).toHaveClass('text-sm', 'text-[var(--fg-3)]', 'text-center')
    expect(continueButton.parentElement).toContainElement(accountButton)
    expect(accountButton).toHaveAttribute('data-variant', 'ghost')
    expect(reason.previousElementSibling).toContainElement(accountButton)
    expect(accountButton.nextElementSibling).toBe(continueButton)

    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk' } })
    expect(screen.queryByText('what.continueReason')).not.toBeInTheDocument()
    expect(continueButton).not.toHaveAttribute('aria-describedby')
  })

  it('ends device onboarding when choosing sign-in', () => {
    useOnboardingDraftStore.setState({ onboardingLocallyDone: false })
    mount(false)
    fireEvent.click(screen.getByRole('button', { name: 'what.haveAccount' }))
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
  })

  it('hides the account action for a signed-in account', () => {
    mount(true)
    expect(screen.queryByRole('button', { name: 'what.haveAccount' })).not.toBeInTheDocument()
  })

  it('puts icon-only Back before the counter and keeps Skip last', async () => {
    mount(false)
    expect(screen.queryByRole('button', { name: 'back' })).toBeNull()
    const counter = screen.getByText((_, element) => isCounter(element))
    const header = counter.parentElement!.parentElement!
    expect(header.querySelectorAll('button')).toHaveLength(1)
    expect(header.querySelector('button')).toBe(screen.getByRole('button', { name: 'skip' }))

    fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    const back = screen.getByRole('button', { name: 'back' })
    expect(back.textContent).toBe('')
    expect(back.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(header.querySelectorAll('button')).toEqual(expect.objectContaining({ 0: back, 1: screen.getByRole('button', { name: 'skip' }) }))
    expect(back.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'skip' })).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByRole('button', { name: 'skip' })).toHaveAttribute('data-size', 'sm')

    fireEvent.click(screen.getByRole('button', { name: 'create' }))
    await screen.findByTestId('reminder-state')
    expect(screen.getByRole('button', { name: 'back' }).textContent).toBe('')
    expect(header.querySelectorAll('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('schedule')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.queryByRole('button', { name: 'back' })).toBeNull()
    expect(screen.getByLabelText('sentence')).toHaveValue('Walk every Monday at 18:00')
  })

  it('uses a ghost button for the reminder deny action', async () => {
    await reachReminder(false)
    expect(screen.getByTestId('reminder-state')).toHaveTextContent('ask')
    expect(screen.getByRole('button', { name: 'remind.deny' })).toHaveAttribute('data-variant', 'ghost')
  })

  it('records a Pro account completion before Done without a router callback', async () => {
    mocks.useRealShell = true
    holdAccount('native-link-pro-account')
    Object.assign(mocks.profile, createMockProfile({ hasCompletedOnboarding: false, hasProAccess: true, plan: 'pro' }))
    let completeAccount!: () => void
    mocks.recordCompletion.mockImplementationOnce(() => new Promise<void>((resolve) => { completeAccount = resolve }))
    await reachReminder(true)
    fireEvent.click(screen.getByRole('button', { name: 'remind.deny' }))
    await waitFor(() => expect(mocks.recordCompletion).toHaveBeenCalledOnce())
    expect(screen.queryByTestId('done')).not.toBeInTheDocument()
    await act(async () => { completeAccount() })
    await screen.findByTestId('done')
    for (const link of screen.getAllByRole('link', { name: 'nav.calendar' })) {
      expect(link).toHaveAttribute('href', '/calendar')
      expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    }
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    expect(screen.getByTestId('done')).toBeInTheDocument()
  })

  it('blocks repeated Skip and other actions while recording completion', async () => {
    let completeAccount!: () => void
    mocks.recordCompletion.mockImplementationOnce(() => new Promise<void>((resolve) => { completeAccount = resolve }))
    mount(true)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await waitFor(() => expect(mocks.recordCompletion).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'skip' })).toBeDisabled()
    expect(screen.getByLabelText('sentence').closest('[inert]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(mocks.recordCompletion).toHaveBeenCalledOnce()
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    await act(async () => { completeAccount() })
    await screen.findByTestId('done')
  })

  it.each(['offline queue', 'profile refresh'] as const)('retains the paid Pro source through %s until a plain exit', async (completion) => {
    mocks.useRealShell = true
    holdAccount('paid-pro-source')
    const profile = createMockProfile({ hasCompletedOnboarding: false, hasProAccess: true, plan: 'pro' })
    Object.assign(mocks.profile, profile)
    mocks.isOnline = false
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mocks.recordCompletion.mockImplementation(() => completeOnboardingOrQueue('paid-pro-source'))
    function OwningComposition({ completed = false }: { completed?: boolean }) {
      const queued = useOnboardingCompletionQueue()
      const required = useRetainedOnboardingGuard({ ...profile, hasCompletedOnboarding: completed }, completion === 'offline queue' && queued)
      const session = useRetainedOnboardingSession(required)
      return session.open ? <RetainedOnboardingOverlay onExit={session.dismiss} /> : <span>destination ready</span>
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const source = render(<QueryClientProvider client={queryClient}><OwningComposition /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await screen.findByTestId('done')
    source.rerender(<QueryClientProvider client={queryClient}><OwningComposition completed /></QueryClientProvider>)
    expect(screen.getByTestId('done')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'nav.calendar' })) expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await screen.findByText('destination ready')
    source.unmount()
    render(<QueryClientProvider client={queryClient}><OwningComposition completed /></QueryClientProvider>)
    expect(screen.queryByTestId('done')).not.toBeInTheDocument()
    expect(screen.getByText('destination ready')).toBeInTheDocument()
  })

  it('keeps the current step and offers recovery when recording completion fails', async () => {
    mocks.recordCompletion.mockRejectedValueOnce(new Error('unavailable'))
    mount(true)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await screen.findByText('completionFailed')
    expect(screen.queryByTestId('done')).not.toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'errorScreen.reload' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    await screen.findByTestId('done')
  })

  it.each(['signed-out Done', 'signed-in unfinished Done', 'signed-in Pro pending'] as const)('preserves native destination activation from %s in both shells', async (mode) => {
    mocks.useRealShell = true
    const isLive = mode !== 'signed-out Done'
    if (isLive) {
      holdAccount('native-link-account')
      Object.assign(mocks.profile, createMockProfile({ hasCompletedOnboarding: false, hasProAccess: false, isTrialActive: false }))
    }
    await reachDone(isLive)
    if (mode === 'signed-in Pro pending') {
      fireEvent.click(screen.getByRole('button', { name: 'finish' }))
      await screen.findByTestId('pro-step')
    }
    const expectedStep = mode === 'signed-in Pro pending' ? 'pro-step' : 'done'
    const links = screen.getAllByRole('link', { name: /^nav\.(calendar|today|progress|profile)$/ })
    expect(links).toHaveLength(8)
    for (const link of links) {
      for (const activation of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
        expect(activation.button === 1 ? fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, ...activation })) : fireEvent.click(link, activation)).toBe(true)
        expect(screen.getByTestId(expectedStep)).toBeInTheDocument()
      }
    }
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
    if (isLive) {
      expect(screen.getAllByRole('link', { name: 'nav.calendar' })[0]).toHaveAttribute('href', '/calendar')
      function PendingInNewContext() { return useOnboardingProPending() ? <RetainedOnboardingOverlay finalStepOnly /> : <span>first step would be owed</span> }
      expect(mocks.profile).toHaveProperty('hasCompletedOnboarding', false)
      cleanup()
      render(<PendingInNewContext />)
      expect(screen.queryByText('first step would be owed')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('pro-step')).toHaveLength(1)
    } else {
      expect(links[0]).toHaveAttribute('href', '/login?from=onboarding')
      const persistedDraft = localStorage.getItem('orbit-onboarding-draft')!
      const persisted = JSON.parse(persistedDraft)
      expect(persisted.state.onboardingLocallyDone).toBe(true)
      cleanup()
      useOnboardingDraftStore.setState({ onboardingLocallyDone: false })
      localStorage.setItem('orbit-onboarding-draft', persistedDraft)
      render(<NavigationContext.Provider value={{ url: '/login?from=onboarding', navigate: mocks.navigate }}><AuthLayout><span>new context sign-in</span></AuthLayout></NavigationContext.Provider>)
      await screen.findByText('new context sign-in')
      expect(mocks.navigate).not.toHaveBeenCalled()
    }
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

  it('offers reminder permission in anonymous onboarding through the real push state hook', async () => {
    mocks.useRealPush = true
    setAccountId(null)
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    vi.stubGlobal('PushManager', class PushManager {})
    const registration = { pushManager: { getSubscription: vi.fn(async () => null) } }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      register: vi.fn(async () => registration), ready: Promise.resolve(registration),
    } })
    await reachReminder(false)
    const allow = await screen.findByRole('button', { name: 'remind.allow' })
    fireEvent.click(allow)
    await waitFor(() => expect(mocks.requestPermissionOnly).toHaveBeenCalledOnce())
    expect(mocks.subscribe).not.toHaveBeenCalled()
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

  it.each(['retry', 'remind.continue'])('dismisses the retained paid Pro recovery session after %s succeeds', async (choice) => {
    let completeRecovery!: () => void
    mocks.finishOnboarding.mockImplementationOnce(() => new Promise<void>((resolve) => { completeRecovery = resolve }))
    mocks.useRealShell = true
    holdAccount('paid-pro-recovery')
    const profile = createMockProfile({ hasCompletedOnboarding: true, hasProAccess: true, plan: 'pro', isTrialActive: false })
    Object.assign(mocks.profile, profile)
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const source = render(<QueryClientProvider client={queryClient}><RetainedRecoverySource profile={profile} /></QueryClientProvider>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('reminder-state')).toHaveTextContent('failed')
    fireEvent.click(screen.getByRole('button', { name: choice }))
    await waitFor(() => expect(mocks.finishOnboarding).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(true)
    await act(async () => { completeRecovery() })
    await screen.findByText('destination ready')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.subscribe).toHaveBeenCalledTimes(choice === 'retry' ? 1 : 0)
    expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(false)
    expect(useOnboardingDraftStore.getState().habits).toEqual([])
    source.unmount()
    render(<QueryClientProvider client={queryClient}><RetainedRecoverySource profile={profile} /></QueryClientProvider>)
    expect(screen.getByText('destination ready')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['registration', 'completion'])('keeps the retained paid Pro recovery open after %s fails', async (failure) => {
    holdAccount('paid-pro-recovery-failure')
    const profile = createMockProfile({ hasCompletedOnboarding: true, hasProAccess: true, plan: 'pro', isTrialActive: false })
    Object.assign(mocks.profile, profile)
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    if (failure === 'registration') mocks.subscribe.mockRejectedValueOnce(new Error('registration failed'))
    else mocks.finishOnboarding.mockRejectedValueOnce(new Error('completion failed'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><RetainedRecoverySource profile={profile} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('button', { name: 'retry' })).toBeEnabled())
    expect(mocks.finishOnboarding).toHaveBeenCalledTimes(failure === 'completion' ? 1 : 0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('reminder-state')).toHaveTextContent('failed')
    expect(screen.queryByText('destination ready')).not.toBeInTheDocument()
    expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(true)
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(1)
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

function BufferedOnboarding() {
  const actions = useBufferOnboardingActions()
  return <OnboardingActionsProvider actions={actions} isLive={false}><OnboardingFlow /></OnboardingActionsProvider>
}

function LoginContext() {
  const flow = useLoginFlow()
  return <div>Entrar {flow.referralCode} {flow.step} {flow.errorKey}</div>
}

function LoginEntry({ initialUrl }: Readonly<{ initialUrl: string }>) {
  const [url, setUrl] = React.useState(initialUrl)
  const navigation = React.useMemo(() => ({ url, navigate: setUrl }), [url])
  const pathname = new URL(url, 'https://orbit.test').pathname
  return <NavigationContext.Provider value={navigation}><output aria-label="Current URL">{url}</output>{pathname === '/onboarding'
    ? <OnboardingLayout><BufferedOnboarding /></OnboardingLayout>
    : <AuthLayout><LoginContext /></AuthLayout>}</NavigationContext.Provider>
}

describe('login context through the owning onboarding layouts', () => {
  beforeEach(async () => {
    installWebLocks()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await resetAuthStore()
    localStorage.clear()
    document.cookie = 'referral_code=;max-age=0;path=/'
    useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
    await useOnboardingDraftStore.persist.rehydrate()
    mocks.navigate.mockReset()
    mocks.profileAvailable = false
    mocks.push.supported = false
    useUIStore.setState({ openOverlayIds: [] })
  })
  afterEach(() => { vi.unstubAllGlobals(); mocks.navigate.mockReset() })

  it.each(['shortcut', 'completion'] as const)('preserves referral and return URL through the %s exit', async (exit) => {
    render(<LoginEntry initialUrl="/login?ref=friend-42&returnUrl=%2Fcalendar" />)
    await waitFor(() => expect(screen.getByLabelText('Current URL')).toHaveTextContent('/onboarding?ref=friend-42&returnUrl=%2Fcalendar'))
    expect(screen.queryByText(/Entrar/)).not.toBeInTheDocument()
    if (exit === 'shortcut') {
      fireEvent.click(screen.getByRole('button', { name: 'what.haveAccount' }))
    } else {
      fireEvent.change(screen.getByLabelText('sentence'), { target: { value: 'Walk every Monday at 18:00' } })
      fireEvent.click(screen.getByRole('button', { name: 'continue' }))
      fireEvent.click(await screen.findByRole('button', { name: 'create' }))
      await screen.findByTestId('reminder-state')
      fireEvent.click(screen.getByRole('button', { name: 'remind.continue' }))
      fireEvent.click(await screen.findByRole('button', { name: 'finish' }))
    }
    await screen.findByText(/Entrar friend-42/)
    const destination = new URL(screen.getByLabelText('Current URL').textContent!, 'https://orbit.test')
    expect(destination.pathname).toBe('/login')
    expect(destination.searchParams.get('ref')).toBe('friend-42')
    expect(destination.searchParams.get('returnUrl')).toBe('/calendar')
    expect(destination.searchParams.get('from')).toBe(exit === 'completion' ? 'onboarding' : null)
    expect(document.cookie).toContain('referral_code=friend-42')
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(exit === 'completion' ? 1 : 0)
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
  })

  it.each([
    ['email=person%40example.com&code=123456&ref=friend-42&returnUrl=%2Fcalendar', 'code'],
    ['googleError=1&returnUrl=%2Fcalendar', 'auth.errors.googleError'],
  ])('opens an in-progress sign-in directly: %s', async (query, state) => {
    render(<LoginEntry initialUrl={`/login?${query}`} />)
    expect(await screen.findByText(new RegExp(`Entrar.*${state}`))).toBeInTheDocument()
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(`/login?${query}`)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
