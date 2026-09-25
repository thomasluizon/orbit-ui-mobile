import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { createTokensV2 } from '@/lib/theme'
import { accountTimezoneDependency } from '@/lib/offline-mutations'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
type TestNode = ReturnType<typeof TestRenderer.create>['root']

function byType(root: TestNode, type: string): TestNode[] {
  return root.findAll((node) => node.type === type)
}

function oneByType(root: TestNode, type: string): TestNode {
  const nodes = byType(root, type)
  expect(nodes).toHaveLength(1)
  return nodes[0]!
}

function prop<T>(node: TestNode, key: string): T {
  return Reflect.get(node.props, key) as T
}

const mocks = vi.hoisted(() => {
  const profile: { aiMessagesLimit: number; aiMessagesUsed: number; timeZone: string | null } = {
    aiMessagesLimit: 5, aiMessagesUsed: 0, timeZone: 'UTC',
  }
  return {
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    finishOnboarding: vi.fn(),
    suggest: vi.fn(),
    requestPermission: vi.fn(),
    requestPermissionOutcome: vi.fn(),
    navigate: vi.fn(),
    refetchProfile: vi.fn(),
  queueTimezone: vi.fn(),
    profileAvailable: true,
    isLive: true,
    profile,
    push: {
      isLoading: false,
      isSupported: true,
      permissionStatus: 'undetermined',
      permissionCanAskAgain: true,
      registrationStatus: 'idle',
    },
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: mocks.navigate, replace: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/stores/ui-store', () => ({ useUIStore: (selector: (state: { astraConversationOpen: boolean }) => unknown) => selector({ astraConversationOpen: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profileAvailable ? mocks.profile : undefined, refetch: mocks.refetchProfile }) }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: mocks.queueTimezone }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: mocks.suggest, isPending: false }) }))
vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({
    ...mocks.push,
    requestPermission: mocks.requestPermission,
    requestPermissionOutcome: mocks.requestPermissionOutcome,
  }),
}))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({
    createHabit: mocks.createHabit,
    updateHabit: mocks.updateHabit,
    deferPushRegistration: vi.fn(),
    finishOnboarding: mocks.finishOnboarding,
  }),
  useOnboardingIsLive: () => mocks.isLive,
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ header, action, notice, children }: { header: React.ReactNode; action: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) => React.createElement('FlowShell', null, header, notice, children, action),
}))
vi.mock('@/components/shell/shell-412', () => ({ Shell412: ({ tabBar, children }: { tabBar?: React.ReactNode; children: React.ReactNode }) => React.createElement('Shell412', null, children, tabBar) }))
vi.mock('@/components/navigation/bottom-tab-bar', () => ({ BottomTabBar: ({ items, activeId, onSelect }: { items: { id: string; label: string }[]; activeId: string; onSelect: (id: string) => void }) => React.createElement('TabBar', { items, activeId, onSelect }) }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) => React.createElement('PillButton', { onClick, disabled: disabled || loading }, children),
}))
vi.mock('@/components/ui/app-toast', () => ({ Toast: ({ message }: { message: string }) => React.createElement('Toast', { message }) }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => React.createElement('SentenceInput', { value: sentence, onChangeText: onChange }),
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ proposed, schedule, canSaveRepeatWeeks, onToggleDay, onTimeChange }: { proposed: boolean; schedule: { intervalWeeks: number }; canSaveRepeatWeeks: boolean; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }) => React.createElement('Schedule', { proposed, intervalWeeks: schedule.intervalWeeks, canSaveRepeatWeeks, onToggleDay, onTimeChange }),
}))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: ({ state }: { state: string }) => React.createElement('ReminderState', { state }) }))
vi.mock('@/components/onboarding/onboarding-complete', () => ({ OnboardingComplete: ({ dueToday, general, onFinish }: { dueToday: boolean; general: boolean; onFinish: () => void }) => React.createElement('Done', { dueToday, general, onFinish }) }))

async function mount(isLive: boolean) {
  mocks.isLive = isLive
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<OnboardingFlow />)
  })
  return tree
}

async function enterSentence(tree: ReturnType<typeof TestRenderer.create>, sentence: string) {
  await TestRenderer.act(() => prop<(value: string) => void>(oneByType(tree.root, 'SentenceInput'), 'onChangeText')(sentence))
}

async function click(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const button = byType(tree.root, 'PillButton').find((node) => node.props.children === label)
  expect(button).toBeDefined()
  await TestRenderer.act(() => prop<() => void>(button!, 'onClick')())
}

function renderedText(tree: ReturnType<typeof TestRenderer.create>): unknown[] {
  return byType(tree.root, 'Text').map((node) => node.props.children)
}

async function pressTextAction(tree: ReturnType<typeof TestRenderer.create>, label: string) {
  const action = findTextAction(tree, label)
  await TestRenderer.act(() => prop<() => void>(action, 'onPress')())
}

function findTextAction(tree: ReturnType<typeof TestRenderer.create>, label: string): TestNode {
  const action = tree.root.findAll((node) => (
    typeof Reflect.get(node.props, 'onPress') === 'function'
    && byType(node, 'Text').some((child) => child.props.children === label)
  )).at(-1)
  expect(action).toBeDefined()
  return action!
}

async function reachReminder(isLive: boolean) {
  if (isLive) mocks.profile.aiMessagesUsed = mocks.profile.aiMessagesLimit
  const tree = await mount(isLive)
  await enterSentence(tree, 'Walk every Monday at 18:00')
  await click(tree, 'onboarding.flow.continue')
  await click(tree, 'onboarding.flow.create')
  expect(oneByType(tree.root, 'ReminderState')).toBeDefined()
  return tree
}

function isCounterText(node: TestNode): boolean {
  const children = Reflect.get(node.props, 'children')
  return Array.isArray(children) && children[0] === 'Orbit '
}

function headerCounter(tree: ReturnType<typeof TestRenderer.create>): string {
  const counters = byType(tree.root, 'Text').filter(isCounterText)
  expect(counters).toHaveLength(1)
  const children = Reflect.get(counters[0]!.props, 'children') as [string, TestNode, string, string]
  return `${prop<string>(children[1], 'children')}${children[2]}${children[3]}`
}

async function reachDone(isLive: boolean) {
  const tree = await reachReminder(isLive)
  await pressTextAction(tree, 'onboarding.flow.remind.deny')
  expect(oneByType(tree.root, 'Done')).toBeDefined()
  return tree
}

async function selectTab(tree: ReturnType<typeof TestRenderer.create>, id: string) {
  await TestRenderer.act(() => prop<(value: string) => void>(oneByType(tree.root, 'TabBar'), 'onSelect')(id))
}

describe('OnboardingFlow state model', () => {
  const originalTimeZone = process.env.TZ

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
    mocks.queueTimezone.mockResolvedValue(undefined)
    mocks.push.isSupported = true
    mocks.push.permissionStatus = 'undetermined'
    mocks.push.permissionCanAskAgain = true
    mocks.push.registrationStatus = 'idle'
    mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
    mocks.requestPermission.mockResolvedValue(true)
    mocks.requestPermissionOutcome.mockResolvedValue('granted')
    useOnboardingDraftStore.getState().reset()
  })

  it('counts each rendered decision once and drops the counter on the done screen', async () => {
    const tree = await mount(false)
    expect(headerCounter(tree)).toBe('01 / 03')
    expect(oneByType(tree.root, 'SentenceInput')).toBeDefined()

    await enterSentence(tree, 'Meditate at 07:00')
    await click(tree, 'onboarding.flow.continue')
    expect(headerCounter(tree)).toBe('02 / 03')
    expect(oneByType(tree.root, 'Schedule')).toBeDefined()

    await click(tree, 'onboarding.flow.create')
    expect(headerCounter(tree)).toBe('03 / 03')
    expect(oneByType(tree.root, 'ReminderState')).toBeDefined()

    await click(tree, 'onboarding.flow.remind.continue')
    expect(oneByType(tree.root, 'Done')).toBeDefined()
    expect(byType(tree.root, 'Text').filter(isCounterText)).toHaveLength(0)
  })

  it.each([
    ['calendario', '/calendar'],
    ['hoje', '/'],
  ])('finishes onboarding and closes the overlay before the %s tab navigates', async (id, route) => {
    const tree = await reachDone(true)
    await selectTab(tree, id)

    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith(route)
    expect(prop<boolean>(oneByType(tree.root, 'Modal'), 'visible')).toBe(false)
  })

  it('sends a signed-out tab through the sign-in handoff rather than a protected route', async () => {
    const tree = await reachDone(false)
    await selectTab(tree, 'calendario')

    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(prop<boolean>(oneByType(tree.root, 'Modal'), 'visible')).toBe(false)
  })

  it('finishes onboarding and closes the overlay from the done button', async () => {
    const tree = await reachDone(true)
    await TestRenderer.act(() => prop<() => void>(oneByType(tree.root, 'Done'), 'onFinish')())

    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(prop<boolean>(oneByType(tree.root, 'Modal'), 'visible')).toBe(false)
  })

  it('never shows or saves a repeat interval a signed-out draft cannot carry', async () => {
    const tree = await mount(false)
    await enterSentence(tree, 'Clean every 3 weeks on Monday')
    await click(tree, 'onboarding.flow.continue')
    const scheduleScreen = oneByType(tree.root, 'Schedule')
    expect(prop<boolean>(scheduleScreen, 'canSaveRepeatWeeks')).toBe(false)
    expect(prop<number>(scheduleScreen, 'intervalWeeks')).toBe(1)
    await click(tree, 'onboarding.flow.create')
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ intervalWeeks: 1, days: ['Monday'] }))
  })

  it('keeps the repeat interval for a signed-in run, which saves it', async () => {
    mocks.profile.aiMessagesUsed = mocks.profile.aiMessagesLimit
    const tree = await mount(true)
    await enterSentence(tree, 'Clean every 3 weeks on Monday')
    await click(tree, 'onboarding.flow.continue')
    const scheduleScreen = oneByType(tree.root, 'Schedule')
    expect(prop<boolean>(scheduleScreen, 'canSaveRepeatWeeks')).toBe(true)
    expect(prop<number>(scheduleScreen, 'intervalWeeks')).toBe(3)
    await click(tree, 'onboarding.flow.create')
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ intervalWeeks: 3 }))
  })

  it('never offers a reminder to a habit with no day of its own', async () => {
    const tree = await mount(false)
    await enterSentence(tree, 'Meditate at 07:00')
    await click(tree, 'onboarding.flow.continue')
    await click(tree, 'onboarding.flow.create')
    expect(prop<string>(oneByType(tree.root, 'ReminderState'), 'state')).toBe('no-day')
    expect(byType(tree.root, 'PillButton').some((node) => node.props.children === 'onboarding.flow.remind.allow')).toBe(false)
    expect(findTextAction(tree, 'onboarding.flow.remind.setDays')).toBeDefined()
  })

  it('tells the done screen a weekday habit that skips today is not in the day', async () => {
    vi.setSystemTime(new Date(2026, 8, 16))
    const tree = await mount(false)
    await enterSentence(tree, 'Walk every Monday and Thursday at 18:00')
    await click(tree, 'onboarding.flow.continue')
    await click(tree, 'onboarding.flow.create')
    await pressTextAction(tree, 'onboarding.flow.remind.deny')
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(false)
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'general')).toBe(false)
  })

  it.each([
    ['UTC', '2026-09-14T02:00:00.000Z', 'America/Sao_Paulo', false],
    ['America/Sao_Paulo', '2026-09-14T00:30:00.000Z', 'UTC', true],
  ])('uses the %s device at %s with the %s profile weekday', async (deviceTimeZone, instant, profileTimeZone, dueToday) => {
    process.env.TZ = deviceTimeZone
    vi.setSystemTime(new Date(instant))
    mocks.profile.timeZone = profileTimeZone
    const tree = await reachDone(true)
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(dueToday)
  })

  it('waits for the profile timezone before saving a signed-in habit', async () => {
    process.env.TZ = 'UTC'
    vi.setSystemTime(new Date('2026-09-14T02:00:00.000Z'))
    mocks.profile.timeZone = 'America/Sao_Paulo'
    mocks.profileAvailable = false
    const tree = await reachDone(true)
    expect(mocks.refetchProfile).toHaveBeenCalledOnce()
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(false)
  })

  it('sets a loaded null timezone before creating in the device account day', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    mocks.profile.timeZone = null
    const tree = await reachDone(true)
    expect(mocks.queueTimezone).toHaveBeenCalledWith(expect.objectContaining({ type: 'setTimeZone', endpoint: API.profile.timezone, payload: { timeZone: 'America/Sao_Paulo' } }))
    expect(mocks.queueTimezone.mock.invocationCallOrder[0]).toBeLessThan(mocks.createHabit.mock.invocationCallOrder[0]!)
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(false)
  })

  it('queues a null timezone before an offline habit save', async () => {
    process.env.TZ = 'America/Sao_Paulo'
    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    mocks.profile.timeZone = null
    mocks.queueTimezone.mockResolvedValue({ queued: true, queuedMutationId: 'timezone-1' })
    const tree = await reachDone(true)
    expect(mocks.queueTimezone).toHaveBeenCalledOnce()
    expect(mocks.createHabit).toHaveBeenCalledOnce()
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }), accountTimezoneDependency('timezone-1'))
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(false)
  })

  it('never tells the done screen a habit with no day is in the day', async () => {
    const tree = await mount(false)
    await enterSentence(tree, 'Meditate at 07:00')
    await click(tree, 'onboarding.flow.continue')
    await click(tree, 'onboarding.flow.create')
    expect(prop<string>(oneByType(tree.root, 'ReminderState'), 'state')).toBe('no-day')
    await click(tree, 'onboarding.flow.remind.continue')
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'dueToday')).toBe(false)
    expect(prop<boolean>(oneByType(tree.root, 'Done'), 'general')).toBe(true)
  })

  it('keeps quiet actions neutral', async () => {
    const tree = await mount(false)
    const skip = byType(tree.root, 'Text').find((node) => node.props.children === 'onboarding.flow.skip')
    expect(skip).toBeDefined()
    expect(prop<unknown[]>(skip!, 'style')).toContainEqual({ color: createTokensV2('purple', 'dark').fg3 })
  })

  it('waits for Astra before exposing schedule actions and persists its flexible cadence', async () => {
    let resolveSuggestion!: (value: HabitSetupSuggestion) => void
    mocks.suggest.mockReturnValue(new Promise<HabitSetupSuggestion>((resolve) => { resolveSuggestion = resolve }))
    const tree = await mount(true)
    await enterSentence(tree, 'Walk 3 times a week')
    await click(tree, 'onboarding.flow.continue')
    expect(byType(tree.root, 'PillButton').some((node) => node.props.children === 'onboarding.flow.create')).toBe(false)
    await TestRenderer.act(() => resolveSuggestion({ emoji: '🚶', frequencyUnit: 'Week', frequencyQuantity: 1, days: [], isFlexible: true, flexibleTarget: 3, dueTime: null, subHabits: [], checklistItems: [] }))
    await click(tree, 'onboarding.flow.create')
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({
      frequencyUnit: 'Week', frequencyQuantity: 3, intervalWeeks: 1, isFlexible: true,
    }))
  })

  it.each([
    [{ emoji: '🧾', frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }, {}],
    [{ emoji: '🧹', frequencyUnit: 'Week' as const, frequencyQuantity: 2, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }, { frequencyUnit: 'Week', frequencyQuantity: 2 }],
  ])('persists the exact Astra cadence', async (suggestion, expected) => {
    mocks.suggest.mockResolvedValue(suggestion)
    const tree = await mount(true)
    await enterSentence(tree, 'Astra cadence')
    await click(tree, 'onboarding.flow.continue')
    await click(tree, 'onboarding.flow.create')
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining(expected))
    const request = mocks.createHabit.mock.calls[0]?.[0]
    expect(request).not.toHaveProperty('isGeneral')
    expect(request).not.toHaveProperty('isFlexible')
  })

  it.each([
    ['general', 'Journal'],
    ['flexible', 'Walk 3 times a week at 18:00'],
  ])('sends explicit fixed mode when correcting a %s habit after Back', async (_mode, sentence) => {
    const tree = await mount(false)
    await enterSentence(tree, sentence)
    await click(tree, 'onboarding.flow.continue')
    await click(tree, 'onboarding.flow.create')

    await pressTextAction(tree, 'onboarding.flow.back')
    await TestRenderer.act(() => prop<(day: string) => void>(oneByType(tree.root, 'Schedule'), 'onToggleDay')('Monday'))
    await click(tree, 'onboarding.flow.create')

    expect(mocks.updateHabit).toHaveBeenCalledWith(
      'habit-1',
      expect.objectContaining({ isGeneral: false, isFlexible: false }),
    )
  })

  it.each([true, false])('removes Skip after a habit exists when isLive=%s', async (isLive) => {
    const tree = await reachReminder(isLive)
    expect(renderedText(tree)).not.toContain('onboarding.flow.skip')
    await pressTextAction(tree, 'onboarding.flow.back')
    expect(oneByType(tree.root, 'Schedule')).toBeDefined()
    expect(renderedText(tree)).not.toContain('onboarding.flow.skip')
  })

  it('asks for native permission on the signed-out path', async () => {
    const tree = await reachReminder(false)
    await click(tree, 'onboarding.flow.remind.allow')
    expect(mocks.requestPermissionOutcome).toHaveBeenCalledWith(false)
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ reminderEnabled: false }))
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true }))
  })

  it('keeps a denial distinct from a successful permission grant', async () => {
    mocks.requestPermissionOutcome.mockResolvedValue('denied')
    const tree = await reachReminder(true)
    await click(tree, 'onboarding.flow.remind.allow')
    expect(oneByType(tree.root, 'ReminderState').props.state).toBe('denied')
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
    expect(byType(tree.root, 'Done')).toHaveLength(0)
  })

  it('does not offer Allow when permission was already refused', async () => {
    mocks.push.permissionStatus = 'denied'
    mocks.push.permissionCanAskAgain = false
    const tree = await reachReminder(true)
    expect(oneByType(tree.root, 'ReminderState').props.state).toBe('refused')
    expect(byType(tree.root, 'PillButton').some((node) => node.props.children === 'onboarding.flow.remind.allow')).toBe(false)
  })

  it('does not offer Allow on an unsupported device', async () => {
    mocks.push.isSupported = false
    const tree = await reachReminder(true)
    expect(oneByType(tree.root, 'ReminderState').props.state).toBe('unsupported')
    expect(byType(tree.root, 'PillButton').some((node) => node.props.children === 'onboarding.flow.remind.allow')).toBe(false)
  })

  it('keeps registration failure separate from denial', async () => {
    mocks.requestPermissionOutcome.mockResolvedValue('failed')
    const tree = await reachReminder(true)
    await click(tree, 'onboarding.flow.remind.allow')
    expect(oneByType(tree.root, 'ReminderState').props.state).toBe('failed')
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })

  it.each([true, false])('persists Not now as reminders off when isLive=%s', async (isLive) => {
    const tree = await reachReminder(isLive)
    await pressTextAction(tree, 'onboarding.flow.remind.deny')
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: false }))
  })

  it('surfaces deferred registration failure after sign-in and retries it', async () => {
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    const tree = await mount(true)

    expect(oneByType(tree.root, 'ReminderState').props.state).toBe('failed')
    expect(renderedText(tree)).not.toContain('onboarding.flow.back')
    await click(tree, 'onboarding.flow.retry')

    expect(mocks.requestPermissionOutcome).toHaveBeenCalledWith(true)
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
  })

  it('locks both reminder choices until Allow completes', async () => {
    let resolvePermission!: (value: 'granted') => void
    mocks.requestPermissionOutcome.mockReturnValue(new Promise((resolve) => { resolvePermission = resolve }))
    const tree = await reachReminder(true)

    await click(tree, 'onboarding.flow.remind.allow')
    const notNow = findTextAction(tree, 'onboarding.flow.remind.deny')
    expect(notNow.props.disabled).toBe(true)
    await TestRenderer.act(() => prop<() => void>(notNow, 'onPress')())
    expect(mocks.updateHabit).not.toHaveBeenCalled()

    await TestRenderer.act(() => resolvePermission('granted'))
    expect(mocks.updateHabit).toHaveBeenCalledWith('habit-1', expect.objectContaining({ reminderEnabled: true }))
    expect(mocks.updateHabit).toHaveBeenCalledOnce()
    expect(oneByType(tree.root, 'Done')).toBeDefined()
  })

  it('keeps header Back inside the pending reminder decision', async () => {
    let resolvePermission!: (value: 'granted') => void
    mocks.requestPermissionOutcome.mockReturnValue(new Promise((resolve) => { resolvePermission = resolve }))
    const tree = await reachReminder(true)

    await click(tree, 'onboarding.flow.remind.allow')
    await pressTextAction(tree, 'onboarding.flow.back')

    expect(oneByType(tree.root, 'ReminderState')).toBeDefined()
    expect(byType(tree.root, 'Schedule')).toHaveLength(0)

    await TestRenderer.act(() => resolvePermission('granted'))
    expect(oneByType(tree.root, 'Done')).toBeDefined()
  })

  it('clears deferred push recovery before hardware Back finishes onboarding', async () => {
    useOnboardingDraftStore.setState({
      habits: [{ title: 'Walk', dueTime: '18:00' }],
      pushPermissionGranted: true,
      pushRegistrationFailed: true,
    })
    const tree = await mount(true)

    await TestRenderer.act(() => prop<() => void>(oneByType(tree.root, 'Modal'), 'onRequestClose')())

    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(useOnboardingDraftStore.getState().pushRegistrationFailed).toBe(false)
    expect(useOnboardingDraftStore.getState().habits).toEqual([])
  })
})
