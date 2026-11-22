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
    wide: false,
    dialogOpenChanges: vi.fn(),
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    recordCompletion: vi.fn(),
    finishOnboarding: vi.fn(),
    suggest: vi.fn(),
    anonymous: vi.fn(),
    anonymousAvailable: false,
    locale: 'en',
    realProposal: false,
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
  useLocale: () => mocks.locale,
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => { const { navigate } = React.useContext(NavigationContext); return { push: navigate, replace: navigate } }, usePathname: () => new URL(React.useContext(NavigationContext).url, 'https://orbit.test').pathname, useSearchParams: () => new URL(React.useContext(NavigationContext).url, 'https://orbit.test').searchParams }))
vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profileAvailable ? mocks.profile : undefined, refetch: mocks.refetchProfile }) }))
vi.mock('@/lib/actions/profile', () => ({ updateTimezone: mocks.updateTimezone }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mocks.suggest, isPending: false }),
}))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: (isLive: boolean) => ({ available: isLive || mocks.anonymousAvailable, mutateAsync: isLive ? mocks.suggest : mocks.anonymous, verification: null, cancel: vi.fn() }) }))
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
  PillButton: ({ children, label, onClick, disabled, loading, variant = 'primary', size = 'md', descriptionId }: { children: React.ReactNode; label?: string; onClick: () => void; disabled?: boolean; loading?: boolean; variant?: string; size?: string; descriptionId?: string }) => <button type="button" aria-label={label} disabled={disabled || loading} onClick={onClick} data-variant={variant} data-size={size} aria-describedby={descriptionId}>{children}</button>,
}))
vi.mock('@/components/ui/toast', () => ({ Toast: ({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) => <div role="status">{message}{actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}</div> }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => <input aria-label="sentence" value={sentence} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/onboarding/onboarding-create-habit')>()
  return {
  OnboardingCreateHabit: (props: React.ComponentProps<typeof original.OnboardingCreateHabit>) => {
    if (mocks.realProposal) return <original.OnboardingCreateHabit {...props} />
    const { emoji, proposed, schedule, canSaveRepeatWeeks, onToggleDay, onTimeChange } = props
    return <div data-testid="schedule" data-emoji={emoji} data-proposed={proposed} data-can-save-repeat-weeks={String(canSaveRepeatWeeks)} data-interval-weeks={String(schedule.intervalWeeks)}><button type="button" onClick={() => onToggleDay('Monday')}>Monday</button><input aria-label="time" onChange={(event) => onTimeChange(event.target.value)} /></div>
  }
} })
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
    mocks.wide = false
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
    mocks.locale = 'en'
    mocks.realProposal = false
    mocks.anonymousAvailable = false
    mocks.anonymous.mockReset()
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
  React.useLayoutEffect(() => {
    const previousUrl = window.location.href
    const replaceState = window.history.replaceState.bind(window.history)
    replaceState(null, '', initialUrl)
    const replacement = vi.spyOn(window.history, 'replaceState').mockImplementation((...arguments_) => {
      replaceState(...arguments_)
      if (arguments_[2]) React.startTransition(() => setUrl(window.location.pathname + window.location.search + window.location.hash))
    })
    return () => { replacement.mockRestore(); replaceState(null, '', previousUrl) }
  }, [initialUrl])
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

  it.each([
    ['email=person%40example.com&code=123456&ref=friend-42&returnUrl=%2Fcalendar', 'code'],
    ['googleError=1&returnUrl=%2Fcalendar', 'auth.errors.googleError'],
  ])('opens an in-progress sign-in directly: %s', async (query, state) => {
    render(<LoginEntry initialUrl={`/login?${query}`} />)
    expect(await screen.findByText(new RegExp(`Entrar.*${state}`))).toBeInTheDocument()
    const clean = new URLSearchParams(query)
    clean.delete('email')
    clean.delete('code')
    expect(screen.getByLabelText('Current URL').textContent).toBe(`/login?${clean.toString()}`)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
