import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { API } from '@orbit/shared/api'
import { getOnboardingRemindCopy } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { accountTimezoneDependency } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { OverlayHost } from '@/components/ui/overlay-host'

const mocks = vi.hoisted(() => ({
  isLive: true, profileAvailable: true, timeZone: 'UTC',
  createHabit: vi.fn(), updateHabit: vi.fn(), finishOnboarding: vi.fn(), permission: vi.fn(), refetchProfile: vi.fn(),
  saved: undefined as Record<string, unknown> | undefined,
  push: { isSupported: true, permissionStatus: 'undetermined', permissionCanAskAgain: true },
}))

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT('en'), i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mocks.profileAvailable ? { timeZone: mocks.timeZone, aiMessagesLimit: 5, aiMessagesUsed: 0, hasProAccess: true, isTrialActive: false, isLifetimePro: true, trialEndsAt: null, planExpiresAt: '2999-01-01T00:00:00Z' } : undefined,
    refetch: mocks.refetchProfile,
  }),
}))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: false, mutateAsync: vi.fn(), verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({ isLoading: false, ...mocks.push, registrationStatus: 'idle', requestPermissionOutcome: mocks.permission }),
}))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/hooks/use-habit-queries')>()), useHabitDetail: (id: string | null) => ({ data: id ? mocks.saved : undefined }) }))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ createHabit: mocks.createHabit, updateHabit: mocks.updateHabit, deferPushRegistration: vi.fn(), finishOnboarding: mocks.finishOnboarding }),
  useOnboardingIsLive: () => mocks.isLive,
}))
vi.mock('@/components/onboarding/onboarding-complete', () => ({ OnboardingComplete: (props: Record<string, unknown>) => React.createElement('Done', props) }))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => React.createElement('ProStep') }))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ header, action, notice, children }: { header: React.ReactNode; action: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) => React.createElement('FlowShell', null, header, notice, children, action),
}))
vi.mock('@/components/ui/app-text-input', () => ({ AppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props) }))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode; unmount(): void }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flow = en.onboarding.flow
const originalTimeZone = process.env.TZ
const trees: TestTree[] = []
const hosts = (tree: TestTree) => tree.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as TestNode)).join('')
const texts = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text').map(textOf)

async function mount(): Promise<TestTree> {
  let tree!: TestTree
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await TestRenderer.act(async () => { tree = TestRenderer.create(<QueryClientProvider client={client}><OverlayHost><OnboardingFlow /></OverlayHost></QueryClientProvider>); await Promise.resolve() })
  trees.push(tree)
  return tree
}

async function press(tree: TestTree, label: string) {
  const button = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || textOf(node) === label))
  if (!button) throw new Error(`no button ${label}`)
  await TestRenderer.act(async () => { (button.props.onPress as () => void)(); await Promise.resolve(); await Promise.resolve() })
}

async function reachReminder(phrase = 'Walk every Monday at 18:00', asks = true): Promise<TestTree> {
  const tree = await mount()
  const field = hosts(tree).find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === flow.guided.what.question)!
  await TestRenderer.act(() => { (field.props.onChangeText as (value: string) => void)(phrase) })
  await press(tree, flow.continue)
  await press(tree, flow.create)
  if (asks) expect(texts(tree)).toContain(flow.guided.remind.line)
  return tree
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  mocks.isLive = true
  mocks.profileAvailable = true
  mocks.timeZone = 'UTC'
  mocks.push = { isSupported: true, permissionStatus: 'undetermined', permissionCanAskAgain: true }
  mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
  mocks.updateHabit.mockResolvedValue(undefined)
  mocks.finishOnboarding.mockResolvedValue(undefined)
  mocks.permission.mockResolvedValue('granted')
  mocks.saved = { id: 'habit-1', frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday'], isGeneral: false, isFlexible: false, dueDate: '2026-11-16', dueTime: '18:00:00' }
  useOnboardingDraftStore.setState({ introSeen: true, habits: [] })
})
afterEach(async () => {
  vi.useRealTimers()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  await TestRenderer.act(() => { for (const tree of trees.splice(0)) tree.unmount() })
})

describe('guided onboarding saves the habit in the account day', () => {
  it('waits for the profile timezone before it saves a signed-in habit', async () => {
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: { timeZone: 'America/Sao_Paulo' } })
    await reachReminder()
    expect(mocks.refetchProfile).toHaveBeenCalledOnce()
    expect(mocks.refetchProfile.mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
    expect(performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('keeps the habit unsaved when the profile never loads', async () => {
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: undefined })
    const tree = await mount()
    const field = hosts(tree).find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === flow.guided.what.question)!
    await TestRenderer.act(() => { (field.props.onChangeText as (value: string) => void)('Walk every Monday at 18:00') })
    await press(tree, flow.continue)
    await press(tree, flow.create)
    expect(mocks.createHabit).not.toHaveBeenCalled()
  })

  it('sets a loaded null timezone before it creates the habit', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    Object.assign(mocks, { timeZone: null })
    vi.mocked(performQueuedApiMutation).mockResolvedValue({})
    await reachReminder()
    expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ type: 'setTimeZone', endpoint: API.profile.timezone, payload: { timeZone: 'America/Sao_Paulo' } }))
    expect(vi.mocked(performQueuedApiMutation).mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
  })

  it('queues a null timezone before an offline save and makes the habit wait for it', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    Object.assign(mocks, { timeZone: null })
    vi.mocked(performQueuedApiMutation).mockResolvedValue({ queued: true, queuedMutationId: 'timezone-1' })
    await reachReminder()
    expect(performQueuedApiMutation).toHaveBeenCalledOnce()
    expect(mocks.createHabit).toHaveBeenCalledOnce()
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }), accountTimezoneDependency('timezone-1'))
  })
})

describe('guided onboarding keeps each reminder decision apart', () => {
  it('shows a registration failure with its own copy and saves reminders off', async () => {
    mocks.permission.mockResolvedValue('failed')
    const tree = await reachReminder()
    await press(tree, flow.guided.remind.allow)
    const failed = en.onboarding.flow.remind[getOnboardingRemindCopy('failed', true).titleKey as keyof typeof en.onboarding.flow.remind]
    const denied = en.onboarding.flow.remind[getOnboardingRemindCopy('denied', true).titleKey as keyof typeof en.onboarding.flow.remind]
    expect(failed).not.toBe(denied)
    expect(texts(tree)).toContain(failed)
    expect(texts(tree)).not.toContain(denied)
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })

  it('shows a denial with its own copy and saves reminders off', async () => {
    mocks.permission.mockResolvedValue('denied')
    const tree = await reachReminder()
    await press(tree, flow.guided.remind.allow)
    const denied = en.onboarding.flow.remind[getOnboardingRemindCopy('denied', true).titleKey as keyof typeof en.onboarding.flow.remind]
    expect(texts(tree)).toContain(denied)
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })

  it.each([true, false])('persists Not now as reminders off when isLive is %s', async (isLive) => {
    mocks.isLive = isLive
    const tree = await reachReminder()
    await press(tree, flow.remind.deny)
    expect(mocks.permission).not.toHaveBeenCalled()
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })
})

const done = (tree: TestTree) => tree.root.findAll((node) => node.type === 'Done')[0]!.props

describe('guided onboarding tells the done screen if the habit is due today', () => {
  it('says a weekday habit that skips today is not in the day', async () => {
    vi.setSystemTime(new Date(2026, 8, 16))
    mocks.isLive = false
    const tree = await reachReminder('Walk every Monday and Thursday at 18:00')
    await press(tree, flow.remind.deny)
    expect(done(tree)).toMatchObject({ dueToday: false, general: false })
  })

  it.each([
    ['UTC', '2026-09-14T02:00:00.000Z', 'America/Sao_Paulo', false],
    ['America/Sao_Paulo', '2026-09-14T00:30:00.000Z', 'UTC', true],
  ])('uses the %s device at %s with the %s profile weekday', async (deviceTimeZone, instant, profileTimeZone, dueToday) => {
    process.env.TZ = deviceTimeZone
    vi.setSystemTime(new Date(instant))
    mocks.timeZone = profileTimeZone
    const tree = await reachReminder()
    await press(tree, flow.remind.deny)
    expect(done(tree).dueToday).toBe(dueToday)
  })

  it('reads the weekday in the timezone the profile loads after the wait', async () => {
    process.env.TZ = 'UTC'
    vi.setSystemTime(new Date('2026-09-14T02:00:00.000Z'))
    mocks.profileAvailable = false
    mocks.refetchProfile.mockResolvedValue({ data: { timeZone: 'America/Sao_Paulo' } })
    const tree = await reachReminder()
    await press(tree, flow.remind.deny)
    expect(done(tree).dueToday).toBe(false)
  })

  it('reads the weekday in the device timezone it queues for a null profile timezone', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    Object.assign(mocks, { timeZone: null })
    vi.mocked(performQueuedApiMutation).mockResolvedValue({})
    const tree = await reachReminder()
    await press(tree, flow.remind.deny)
    expect(done(tree).dueToday).toBe(false)
  })
})

const remindCopy = (state: Parameters<typeof getOnboardingRemindCopy>[0]) => {
  const { titleKey, bodyKey } = getOnboardingRemindCopy(state, true)
  return { title: en.onboarding.flow.remind[titleKey as keyof typeof en.onboarding.flow.remind], body: en.onboarding.flow.remind[bodyKey as keyof typeof en.onboarding.flow.remind] }
}
const buttonLabels = (tree: TestTree) => hosts(tree).filter((node) => node.props.accessibilityRole === 'button').map((node) => (node.props.accessibilityLabel as string | undefined) ?? textOf(node))

describe('guided onboarding offers no reminder the device or the habit cannot carry', () => {
  it('offers no Allow when the device already refused notifications', async () => {
    mocks.push = { isSupported: true, permissionStatus: 'denied', permissionCanAskAgain: false }
    const tree = await reachReminder(undefined, false)
    const refused = remindCopy('refused')
    expect(texts(tree)).toContain(refused.title)
    expect(texts(tree)).toContain(refused.body)
    expect(buttonLabels(tree)).not.toContain(flow.guided.remind.allow)
    expect(buttonLabels(tree)).toContain(flow.remind.continue)
    expect(mocks.permission).not.toHaveBeenCalled()
  })

  it('offers no Allow on a device that cannot register', async () => {
    mocks.push = { isSupported: false, permissionStatus: 'undetermined', permissionCanAskAgain: true }
    const tree = await reachReminder(undefined, false)
    const unsupported = remindCopy('unsupported')
    expect(texts(tree)).toContain(unsupported.title)
    expect(texts(tree)).not.toContain(remindCopy('refused').title)
    expect(buttonLabels(tree)).not.toContain(flow.guided.remind.allow)
  })

  it('offers days, and no Allow, to a habit with no day of its own', async () => {
    const tree = await mount()
    const field = hosts(tree).find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === flow.guided.what.question)!
    await TestRenderer.act(() => { (field.props.onChangeText as (value: string) => void)('Meditate at 07:00') })
    await press(tree, flow.continue)
    await press(tree, flow.guided.mode.fixed)
    await press(tree, flow.continue)
    await press(tree, flow.create)
    const noDay = remindCopy('no-day')
    expect(texts(tree)).toContain(noDay.title)
    expect(buttonLabels(tree)).toContain(flow.remind.setDays)
    expect(buttonLabels(tree)).not.toContain(flow.guided.remind.allow)
  })
})

describe('guided onboarding finishes a push registration that failed before sign-in', () => {
  const deferredFailure = () => useOnboardingDraftStore.setState({ habits: [{ title: 'Walk', dueTime: '18:00' }], pushPermissionGranted: true, pushRegistrationFailed: true })

  it('states the failure with no Back, retries the registration and finishes onboarding', async () => {
    deferredFailure()
    const tree = await mount()
    expect(texts(tree)).toContain(remindCopy('failed').title)
    expect(buttonLabels(tree)).not.toContain(flow.back)
    await press(tree, flow.retry)
    expect(mocks.permission).toHaveBeenCalledWith(true)
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.updateHabit).not.toHaveBeenCalled()
  })

  it('saves no habit when the retry is denied and states the denial', async () => {
    deferredFailure()
    mocks.permission.mockResolvedValue('denied')
    const tree = await mount()
    await press(tree, flow.retry)
    expect(texts(tree)).toContain(remindCopy('denied').title)
    expect(mocks.updateHabit).not.toHaveBeenCalled()
    expect(mocks.finishOnboarding).not.toHaveBeenCalled()
  })

  it('finishes onboarding with no registration when the person continues without reminders', async () => {
    deferredFailure()
    const tree = await mount()
    await press(tree, flow.remind.continue)
    expect(mocks.permission).not.toHaveBeenCalled()
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.updateHabit).not.toHaveBeenCalled()
  })
})

describe('guided onboarding locks both reminder choices while one runs', () => {
  it('ignores Not now until Allow completes, then saves reminders on once', async () => {
    let resolvePermission!: (value: 'granted') => void
    mocks.permission.mockReturnValue(new Promise((resolve) => { resolvePermission = resolve }))
    const tree = await reachReminder()
    await press(tree, flow.guided.remind.allow)
    await press(tree, flow.remind.deny)
    expect(mocks.updateHabit).not.toHaveBeenCalled()
    await press(tree, flow.guided.remind.allow)
    expect(mocks.permission).toHaveBeenCalledOnce()
    await TestRenderer.act(async () => { resolvePermission('granted'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.updateHabit).toHaveBeenCalledOnce()
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true }))
  })

  it('ignores Allow until Not now completes', async () => {
    let resolveUpdate!: () => void
    mocks.updateHabit.mockReturnValue(new Promise<void>((resolve) => { resolveUpdate = resolve }))
    const tree = await reachReminder()
    await press(tree, flow.remind.deny)
    await press(tree, flow.guided.remind.allow)
    expect(mocks.permission).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { resolveUpdate(); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.updateHabit).toHaveBeenCalledOnce()
  })
})
