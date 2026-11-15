import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildOnboardingHabitInput, buildOnboardingScheduleFromPhrase } from '@orbit/shared/utils'
import { testI18n } from '@/__tests__/support/i18n'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { OverlayHost } from '@/components/ui/overlay-host'

const mocks = vi.hoisted(() => ({
  language: 'en', isLive: true, pro: true, reducedMotion: false, suggestionAvailable: false,
  createHabit: vi.fn(), updateHabit: vi.fn(), finishOnboarding: vi.fn(), suggest: vi.fn(), permission: vi.fn(),
  navigate: vi.fn(), replace: vi.fn(), completed: vi.fn(), event: vi.fn(),
  saved: undefined as Record<string, unknown> | undefined,
}))

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: mocks.navigate, replace: mocks.replace }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { timeZone: 'UTC', aiMessagesLimit: 5, aiMessagesUsed: 0, hasProAccess: mocks.pro, isTrialActive: false, isLifetimePro: mocks.pro, trialEndsAt: null, planExpiresAt: mocks.pro ? '2999-01-01T00:00:00Z' : null },
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-onboarding-suggestion', () => ({ useOnboardingSuggestion: () => ({ available: mocks.suggestionAvailable, mutateAsync: mocks.suggest, verification: null, cancel: vi.fn() }) }))
vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({ isLoading: false, isSupported: true, permissionStatus: 'undetermined', permissionCanAskAgain: true, registrationStatus: 'idle', requestPermissionOutcome: mocks.permission }),
}))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/hooks/use-habit-queries')>()), useHabitDetail: (id: string | null) => ({ data: id ? mocks.saved : undefined }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/posthog')>()), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: mocks.event }))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ createHabit: mocks.createHabit, updateHabit: mocks.updateHabit, deferPushRegistration: vi.fn(), finishOnboarding: mocks.finishOnboarding }),
  useOnboardingIsLive: () => mocks.isLive,
}))
vi.mock('@/components/onboarding/onboarding-pro-step', () => ({ OnboardingProStep: () => React.createElement('ProStep') }))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ header, action, notice, children }: { header: React.ReactNode; action: React.ReactNode; notice?: React.ReactNode; children: React.ReactNode }) => React.createElement('FlowShell', null, header, notice, children, action),
}))
vi.mock('@/components/ui/app-text-input', () => ({ AppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props) }))


interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode; unmount(): void }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The record the server saved. Its days, time and start differ from the typed phrase, so a sentence built from the draft fails. */
const SAVED_HABIT = { id: 'habit-1', frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueDate: '2026-11-16', dueTime: '18:30:00' }

const trees: TestTree[] = []
type Messages = typeof en

async function mount(guided = true): Promise<TestTree> {
  let tree!: TestTree
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await TestRenderer.act(async () => { tree = TestRenderer.create(<QueryClientProvider client={client}><OverlayHost><OnboardingFlow guided={guided} /></OverlayHost></QueryClientProvider>); await Promise.resolve() })
  trees.push(tree)
  return tree
}

const hosts = (tree: TestTree) => tree.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as TestNode)).join('')
const texts = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text').map(textOf)
const heading = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text' && node.props.accessibilityRole === 'header').map(textOf).at(-1)

async function press(tree: TestTree, label: string) {
  const button = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || textOf(node) === label))
  if (!button) throw new Error(`no button ${label}`)
  await TestRenderer.act(async () => { (button.props.onPress as () => void)(); await Promise.resolve(); await Promise.resolve() })
}

async function typePhrase(tree: TestTree, messages: Messages, phrase: string) {
  const field = hosts(tree).find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === messages.onboarding.flow.guided.what.question)!
  await TestRenderer.act(() => { (field.props.onChangeText as (value: string) => void)(phrase) })
  await press(tree, messages.onboarding.flow.continue)
}

function progress(tree: TestTree): string | undefined {
  return hosts(tree).find((node) => node.props.accessibilityRole === 'progressbar' || (typeof node.props.accessibilityLabel === 'string' && /^(Step|Passo) \d/.test(node.props.accessibilityLabel)))?.props.accessibilityLabel as string | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.language = 'en'
  mocks.isLive = true
  mocks.pro = true
  mocks.reducedMotion = false
  mocks.suggestionAvailable = false
  mocks.createHabit.mockResolvedValue({ id: 'habit-1', title: 'Walk' })
  mocks.updateHabit.mockResolvedValue(undefined)
  mocks.finishOnboarding.mockResolvedValue(undefined)
  mocks.permission.mockResolvedValue('granted')
  mocks.saved = SAVED_HABIT
  useOnboardingDraftStore.setState({ introSeen: false, habits: [] })
})
afterEach(async () => {
  await TestRenderer.act(() => { for (const tree of trees.splice(0)) tree.unmount() })
})

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android guided onboarding in $language', ({ language, messages }) => {
  const flow = messages.onboarding.flow
  const guided = flow.guided
  beforeEach(() => { mocks.language = language })

  it('explains Orbit on three intro screens before the first question, and reaches it in three taps', async () => {
    const tree = await mount()
    const poses = ['olhando', 'pensando', 'parado']
    for (const [index, intro] of [guided.intro.talk, guided.intro.routine, guided.intro.restart].entries()) {
      expect(heading(tree)).toBe(intro.title)
      expect(hosts(tree).find((node) => node.props.testID === 'orbit-mascot')?.props['data-orbit-state'], `the pose of intro screen ${index}`).toBe(poses[index])
      expect(useOnboardingDraftStore.getState().introSeen, `the intro is not seen on screen ${index}`).toBe(false)
      expect(texts(tree)).toContain(intro.body)
      expect(progress(tree)).toBe(messages.habits.flow.progress.replace('{position}', String(index + 1)).replace('{total}', '3'))
      expect(texts(tree)).toContain(guided.intro.skip)
      await press(tree, flow.continue)
    }
    expect(heading(tree)).toBe(guided.what.question)
    expect(useOnboardingDraftStore.getState().introSeen).toBe(true)
  })

  it.each([0, 1, 2])('skips the intro from screen %i straight to the first question, and never shows it again', async (screenIndex) => {
    const tree = await mount()
    for (let index = 0; index < screenIndex; index += 1) await press(tree, flow.continue)
    await press(tree, guided.intro.skip)
    expect(heading(tree)).toBe(guided.what.question)
    const again = await mount()
    expect(heading(again)).toBe(guided.what.question)
  })

  it.each([0, 1, 2])('shows the intro again from its first screen to a person who quit on screen %i', async (screenIndex) => {
    const tree = await mount()
    for (let index = 0; index < screenIndex; index += 1) await press(tree, flow.continue)
    const again = await mount()
    expect(heading(again)).toBe(guided.intro.talk.title)
  })

  it('goes from a phrase with a schedule and a time straight to the summary', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    expect(texts(tree)).toContain(messages.habits.flow.what.lineEmpty)
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    expect(heading(tree)).toBe(guided.summary.question)
    expect(progress(tree)).toBe(messages.habits.flow.progress.replace('{position}', '2').replace('{total}', '3'))
  })

  it('asks how it repeats when the phrase has no schedule, then the days, then the summary', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Meditate' : 'Meditar')
    expect(heading(tree)).toBe(flow.when.scheduleMode)
    await press(tree, guided.mode.fixed)
    expect(heading(tree)).toBe(flow.when.daysLabel)
    await press(tree, guided.days.everyDay)
    expect(heading(tree)).toBe(guided.summary.question)
  })

  it('fills the phrase and advances in one press of a starter', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await press(tree, flow.what.starterLabels.walk)
    expect(heading(tree)).toBe(guided.summary.question)
  })

  it('opens the step of a summary value and returns to the summary with the answer', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday' : 'Caminhar toda segunda')
    const timeRow = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith(guided.summary.time))!
    await TestRenderer.act(() => { (timeRow.props.onPress as () => void)() })
    expect(heading(tree)).toBe(guided.time.question)
    await press(tree, guided.time.none)
    expect(heading(tree)).toBe(guided.summary.question)
  })

  const optionCards = (tree: TestTree) => hosts(tree).filter((node) => node.props.testID === 'option-card').map((node) => node.props.accessibilityLabel)
  const summaryRow = (tree: TestTree, label: string) => hosts(tree).find((node) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith(`${label},`))
  const radios = (tree: TestTree) => hosts(tree).filter((node) => node.props.accessibilityRole === 'radio' || node.props.accessibilityRole === 'radiogroup')

  it('asks the period on its own step before the count, with one quick option for each period and no segmented control', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Meditate' : 'Meditar')
    await press(tree, guided.mode.flexible)
    expect(heading(tree)).toBe(flow.when.frequencyUnitLabel)
    expect(progress(tree)).toBe(messages.habits.flow.progress.replace('{position}', '3').replace('{total}', '6'))
    expect(optionCards(tree)).toEqual([flow.when.units.day, flow.when.units.week, flow.when.units.month, flow.when.units.year])
    expect(radios(tree)).toHaveLength(0)
    await press(tree, flow.when.units.month)
    expect(heading(tree)).toBe(guided.quantity.question)
    expect(progress(tree)).toBe(messages.habits.flow.progress.replace('{position}', '4').replace('{total}', '6'))
    expect(radios(tree)).toHaveLength(0)
    await press(tree, flow.when.quantityMore)
    await press(tree, flow.continue)
    expect(heading(tree)).toBe(guided.summary.question)
    await press(tree, flow.back)
    expect(heading(tree)).toBe(guided.quantity.question)
    await press(tree, flow.back)
    expect(heading(tree)).toBe(flow.when.frequencyUnitLabel)
  })

  it('shows the period as a summary value that opens its own step and returns with the answer', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Meditate' : 'Meditar')
    await press(tree, guided.mode.interval)
    await press(tree, flow.when.units.week)
    expect(heading(tree)).toBe(guided.interval.question)
    await press(tree, flow.continue)
    expect(summaryRow(tree, guided.summary.unit)?.props.accessibilityLabel).toBe(`${guided.summary.unit}, ${flow.when.units.week}`)
    await TestRenderer.act(() => { (summaryRow(tree, guided.summary.unit)!.props.onPress as () => void)() })
    expect(heading(tree)).toBe(flow.when.frequencyUnitLabel)
    await press(tree, flow.when.units.day)
    expect(heading(tree)).toBe(guided.summary.question)
    expect(summaryRow(tree, guided.summary.unit)?.props.accessibilityLabel).toBe(`${guided.summary.unit}, ${flow.when.units.day}`)
    await press(tree, flow.create)
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 2 }))
  })

  it('has no period value on the summary of a habit with set days', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday' : 'Caminhar toda segunda')
    expect(summaryRow(tree, guided.summary.unit)).toBeUndefined()
  })

  it('shows the emoji as a summary value that opens the emoji picker, and saves the chosen emoji', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    expect(summaryRow(tree, guided.summary.what)?.props.accessibilityLabel).toBe(`${guided.summary.what}, ${language === 'en' ? 'Walk' : 'Caminhar'}`)
    await press(tree, messages.habits.form.emojiOpenPicker)
    expect(texts(tree)).toContain(messages.habits.form.emojiPickerTitle)
    const option = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).startsWith(`${messages.habits.form.emoji}: `))!
    const chosen = String(option.props.accessibilityLabel).slice(`${messages.habits.form.emoji}: `.length)
    await TestRenderer.act(async () => { (option.props.onPress as () => void)(); await Promise.resolve(); await Promise.resolve() })
    expect(heading(tree)).toBe(guided.summary.question)
    await press(tree, flow.create)
    expect(mocks.createHabit).toHaveBeenCalledWith(expect.objectContaining({ emoji: chosen }))
  })

  it('keeps the typed habit on the summary after a failed create, offers retry, and opens no dialog', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    mocks.createHabit.mockRejectedValueOnce(new Error('offline'))
    const tree = await mount()
    const phrase = language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00'
    await typePhrase(tree, messages, phrase)
    await press(tree, flow.create)
    expect(heading(tree)).toBe(guided.summary.question)
    expect(texts(tree)).toContain(flow.createFailed)
    expect(hosts(tree).some((node) => node.props.testID === 'result-dialog')).toBe(false)
    expect(mocks.createHabit).toHaveBeenCalledWith(buildOnboardingHabitInput({ sentence: phrase, locale: language, emoji: '', reminderEnabled: false, schedule: buildOnboardingScheduleFromPhrase(phrase, language) }))
    await press(tree, flow.retry)
    expect(mocks.createHabit).toHaveBeenCalledTimes(2)
  })

  it('asks for reminders with two quick options and closes with the result dialog from the saved habit', async () => {
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await press(tree, flow.create)
    expect(texts(tree)).toContain(guided.remind.line)
    await press(tree, guided.remind.allow)
    expect(mocks.permission).toHaveBeenCalledTimes(1)
    const dialog = hosts(tree).find((node) => node.props.testID === 'result-dialog')!
    expect(dialog.props.accessibilityLabel).toBe(messages.result.title)
    expect(String(dialog.props.accessibilityHint)).toMatch(/6:30\sPM|18:30/)
    expect(String(dialog.props.accessibilityHint)).toMatch(language === 'en' ? /Thursday/ : /quinta/)
    expect(String(dialog.props.accessibilityHint)).not.toMatch(/6:00\sPM|18:00/)
    expect(mocks.completed).toHaveBeenCalledWith('onboarding', 3, false)
    await press(tree, messages.result.seeToday)
    expect(mocks.finishOnboarding).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith('/')
  })

  const resultDialog = (tree: TestTree) => hosts(tree).find((node) => node.props.testID === 'result-dialog')
  async function toResult(tree: TestTree) {
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await press(tree, flow.create)
    await press(tree, flow.remind.deny)
  }

  it('opens no result dialog until the saved habit is in the query cache', async () => {
    mocks.saved = undefined
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await toResult(tree)
    expect(resultDialog(tree)).toBeUndefined()
  })

  it('builds the sentence of a create that waits in the offline queue from the optimistic record', async () => {
    mocks.saved = undefined
    mocks.createHabit.mockResolvedValue({ id: 'offline-1', title: 'Walk' })
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await toResult(tree)
    expect(String(resultDialog(tree)?.props.accessibilityHint)).toMatch(/6:00\sPM|18:00/)
    expect(String(resultDialog(tree)?.props.accessibilityHint)).toMatch(language === 'en' ? /Monday/ : /segunda/)
  })

  it('builds the sentence before sign-in from the habit that waits on this device, and offers sign-in', async () => {
    mocks.isLive = false
    mocks.createHabit.mockImplementation((input: Parameters<ReturnType<typeof useOnboardingDraftStore.getState>['bufferHabit']>[0]) => {
      const index = useOnboardingDraftStore.getState().bufferHabit({ ...input, dueTime: '07:15' })
      return Promise.resolve({ id: String(index), title: input.title })
    })
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await toResult(tree)
    expect(String(resultDialog(tree)?.props.accessibilityHint)).toMatch(/7:15\sAM|07:15/)
    expect(String(resultDialog(tree)?.props.accessibilityHint)).toMatch(language === 'en' ? /Monday/ : /segunda/)
    expect(texts(tree)).toContain(flow.done.signIn)
  })

  it('declines reminders with no permission request, and follows the dialog with the Pro step on the free plan', async () => {
    mocks.pro = false
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await typePhrase(tree, messages, language === 'en' ? 'Walk every Monday at 18:00' : 'Caminhar toda segunda às 18:00')
    await press(tree, flow.create)
    await press(tree, flow.remind.deny)
    expect(mocks.permission).not.toHaveBeenCalled()
    await press(tree, messages.result.seeToday)
    expect(tree.root.findAll((node) => node.type === 'ProStep')).toHaveLength(1)
  })

  it('opens the login from the account link before sign-in', async () => {
    mocks.isLive = false
    useOnboardingDraftStore.setState({ introSeen: true })
    const tree = await mount()
    await press(tree, flow.what.haveAccount)
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })
})

describe.each([false, true])('Android guided onboarding with reduced motion %s', (reducedMotion) => {
  it('keeps the same intro text and shows it still under reduced motion', async () => {
    mocks.reducedMotion = reducedMotion
    const tree = await mount()
    const sentence = hosts(tree).find((node) => node.props.testID === 'intro-sentence')!
    expect(textOf(sentence)).toBe(en.onboarding.flow.guided.intro.talk.body)
    const opacity = (sentence.props.style as { opacity: { value: number } }).opacity
    expect(opacity.value).toBe(reducedMotion ? 1 : 0)
    expect(hosts(tree).find((node) => node.type === 'Modal')?.props.animationType).toBe(reducedMotion ? 'none' : 'fade')
  })
})

it('sends the suggestion the same body as the current flow', async () => {
  mocks.suggestionAvailable = true
  mocks.suggest.mockResolvedValue({ emoji: '🚶', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], dueTime: '07:00', isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [] })
  useOnboardingDraftStore.setState({ introSeen: true })
  const tree = await mount()
  await typePhrase(tree, en, 'Walk')
  expect(mocks.suggest).toHaveBeenCalledWith({ title: 'Walk', language: 'en' })
  expect(heading(tree)).toBe(en.onboarding.flow.guided.summary.question)
  const emojiControl = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === en.habits.form.emojiOpenPicker)!
  expect(textOf(emojiControl)).toBe('🚶')
  expect(emojiControl.props.accessibilityHint).toBe(en.habits.form.proposedByAstra)
})

it('renders the current Android onboarding with the flag off', async () => {
  const tree = await mount(false)
  expect(texts(tree)).toContain(en.onboarding.flow.what.title)
  expect(texts(tree)).not.toContain(en.onboarding.flow.guided.intro.talk.title)
  expect(hosts(tree).some((node) => node.props.testID === 'question-flow')).toBe(false)
})
