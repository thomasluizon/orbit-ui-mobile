import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

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

const mocks = vi.hoisted(() => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  finishOnboarding: vi.fn(),
  suggest: vi.fn(),
  requestPermission: vi.fn(),
  requestPermissionOutcome: vi.fn(),
  isLive: true,
  profile: { aiMessagesLimit: 5, aiMessagesUsed: 0 },
  push: {
    isLoading: false,
    isSupported: true,
    permissionStatus: 'undetermined',
    permissionCanAskAgain: true,
    registrationStatus: 'idle',
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/stores/ui-store', () => ({ useUIStore: (selector: (state: { astraConversationOpen: boolean }) => unknown) => selector({ astraConversationOpen: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
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
vi.mock('@/components/shell/shell-412', () => ({ Shell412: ({ children }: { children: React.ReactNode }) => React.createElement('Shell412', null, children) }))
vi.mock('@/components/navigation/destination-tab-bar', () => ({ DestinationTabBar: () => null }))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) => React.createElement('PillButton', { onClick, disabled: disabled || loading }, children),
}))
vi.mock('@/components/ui/app-toast', () => ({ Toast: ({ message }: { message: string }) => React.createElement('Toast', { message }) }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: ({ sentence, onChange }: { sentence: string; onChange: (value: string) => void }) => React.createElement('SentenceInput', { value: sentence, onChangeText: onChange }),
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ proposed, onToggleDay, onTimeChange }: { proposed: boolean; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }) => React.createElement('Schedule', { proposed, onToggleDay, onTimeChange }),
}))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: ({ state }: { state: string }) => React.createElement('ReminderState', { state }) }))
vi.mock('@/components/onboarding/onboarding-complete', () => ({ OnboardingComplete: () => React.createElement('Done') }))

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

describe('OnboardingFlow state model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile.aiMessagesUsed = 0
    mocks.push.isSupported = true
    mocks.push.permissionStatus = 'undetermined'
    mocks.push.permissionCanAskAgain = true
    mocks.push.registrationStatus = 'idle'
    mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
    mocks.requestPermission.mockResolvedValue(true)
    mocks.requestPermissionOutcome.mockResolvedValue('granted')
    useOnboardingDraftStore.getState().reset()
  })

  it('shows three decisions and a separate done state', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingNextStep(ONBOARDING_REMIND_STEP)).toBe(ONBOARDING_DONE_STEP)
    expect(getOnboardingPreviousStep(ONBOARDING_DONE_STEP)).toBe(ONBOARDING_REMIND_STEP)
    expect(shouldHideOnboardingFooter(1)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_DONE_STEP)).toBe(true)
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
