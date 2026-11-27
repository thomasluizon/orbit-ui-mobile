import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createApiClientError } from '@orbit/shared/utils'
import type { HabitPhraseReadResponse } from '@orbit/shared/types'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { i18n } from '@/lib/i18n'
import { nativeWindows, press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  pro: true, detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, replace: state.replace, back: vi.fn(), canGoBack: () => true }), useIsFocused: () => true, useLocalSearchParams: () => ({}) }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: state.pro } }),
  useHasProAccess: () => state.pro,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: state.subCreate, isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: (id: string | null) => ({ data: id ? state.saved ?? undefined : undefined, isPending: state.detailPending, isFetching: state.detailFetching, error: state.detailError, refetch: state.refetchDetail, retry: state.refetchDetail }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.phraseRead, isPending: false }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, requestPermission: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null, useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: state.completed }))

type Tree = ReturnType<typeof renderNavigation>
const control = (tree: Tree, name: string | RegExp) => tree.hosts().find((node) => (typeof name === 'string' ? node.props.accessibilityLabel === name : name.test(node.props.accessibilityLabel ?? '')) && typeof node.props.onPress === 'function')
const heading = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))[0] ?? ''
const hasTestId = (tree: Tree, testID: string) => tree.hosts().some((node) => node.props.testID === testID)
const rowMarked = (tree: Tree, name: RegExp) => tree.hosts().some((node) => node.props.testID === 'proposed-row'
  && (node as unknown as ReactTestInstance).findAll((child) => typeof child.type === 'string' && name.test((child.props as { accessibilityLabel?: string }).accessibilityLabel ?? '') && typeof child.props.onPress === 'function').length > 0)
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
async function tap(tree: Tree, name: string | RegExp) {
  const target = control(tree, name)
  if (!target) throw new Error(`no control named ${String(name)}`)
  await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
}
async function primary(tree: Tree) {
  const action = tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && typeof node.props.onPress === 'function')
  if (!action) throw new Error('no primary action')
  await act(async () => { press(action); await Promise.resolve(); await Promise.resolve() })
}
const proposedMarks = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityLabel === ptBR.habits.detail.proposed).length
async function keepProposedAnswersToSummary(tree: Tree) {
  for (let guard = 0; guard < 5; guard += 1) {
    const text = heading(tree)
    if (text === ptBR.habits.flow.confirm.question) return
    if (text.startsWith(ptBR.habits.flow.reminder.question.split('{')[0]!.trim())) await tap(tree, ptBR.habits.flow.reminder.no)
    else await primary(tree)
  }
}
async function phrase(tree: Tree, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.what.label)!
  await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
  await primary(tree)
}

const storedHabit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00', reminderEnabled: false })

function mountCreate(initialDate?: string) {
  return renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} initialDate={initialDate} /></QueryClientProvider>)
}
function mountEdit(onClose = vi.fn()) {
  return renderNavigation(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onClose={onClose} habit={storedHabit} /></QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.create.mockReset()
  state.replace.mockReset()
  state.update.mockReset().mockResolvedValue({})
  state.completed.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.subCreate.mockReset().mockResolvedValue({ id: 'child-1' })
  state.saved = null
  state.pro = true
  state.detailPending = false
  state.detailFetching = false
  state.detailError = null
  state.refetchDetail.mockReset().mockResolvedValue({ isSuccess: false })
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe('the Android create surface', () => {

  it('renders the one-question flow in the flow host with the flag on', async () => {
    const tree = mountCreate()
    await settle()
    expect(hasTestId(tree, 'flow-screen')).toBe(true)
    expect(hasTestId(tree, 'question-flow')).toBe(true)
    expect(heading(tree)).toBe(ptBR.habits.flow.what.question)
    tree.unmount()
  })

  it('queues a create made offline once and opens the result dialog from the optimistic record', async () => {
    state.create.mockResolvedValue({ id: 'offline-42' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João')
    await tap(tree, ptBR.habits.flow.when.tomorrow)
    await tap(tree, '08:00')
    await tap(tree, ptBR.habits.flow.reminder.no)
    const action = tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && typeof node.props.onPress === 'function')!
    await act(async () => { action.props.onPress?.(); action.props.onPress?.(); await Promise.resolve(); await Promise.resolve() })
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.create.mock.calls[0]![0]).toEqual({
      title: 'ligar para o João', isBadHabit: false, dueDate: '2026-11-14', dueTime: '08:00', reminderEnabled: false, reminderTimes: [], relativeReminders: [],
    })
    expect(state.completed).toHaveBeenCalledWith('habit_create', 5, false)
    expect(tree.hosts().some((node) => typeof node.props.children === 'string' && node.props.children.includes('08:00') && node.props.children.startsWith('A tarefa ficou marcada para'))).toBe(true)
    expect(nativeWindows(tree), 'the result draws in the window of the flow, so iOS presents one Modal').toHaveLength(1)
    tree.unmount()
  })
})

describe('a guided create on Android from a phrase with a repeat', () => {
  const sent = () => state.create.mock.calls[0]![0] as Record<string, unknown>
  const alertText = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'alert').map((node) => node.props.children)

  it('gives the repeat its start day and saves the title with no schedule words', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João todo dia às 8')
    expect(heading(tree)).toBe(ptBR.habits.flow.reminder.question.replace('{time}', '08:00'))
    await tap(tree, ptBR.habits.flow.reminder.no)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({ title: 'ligar para o João', startDate: '2026-11-13', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
    expect(alertText(tree)).toEqual([])
    tree.unmount()
  })

  it('saves the title with no schedule words when the flow opens with a day', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate('2026-11-20')
    await settle()
    await phrase(tree, 'ligar para o João todo dia às 8')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await primary(tree)
    expect(sent()).toMatchObject({ title: 'ligar para o João', startDate: '2026-11-20', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
    tree.unmount()
  })

  it('keeps the words of a time the person changed in the saved title, as the full form does', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João todo dia às 8')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await tap(tree, /^Hora,/)
    await tap(tree, '14:00')
    await primary(tree)
    expect(sent()).toMatchObject({ title: 'ligar para o João às 8', startDate: '2026-11-13', dueTime: '14:00', frequencyUnit: 'Day' })
    tree.unmount()
  })

  it('keeps the repeat words of the phrase in the title after the type step makes the item a task and the date question gives a day', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João todo dia às 8')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.type}`))
    await tap(tree, new RegExp(`^${ptBR.habits.form.typeTask}`))
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.when}`))
    await tap(tree, ptBR.habits.flow.when.today)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({ title: 'ligar para o João todo dia', dueDate: '2026-11-13', dueTime: '08:00' })
    expect(sent()).not.toHaveProperty('frequencyUnit')
    tree.unmount()
  })

  it('keeps the repeat words of the phrase in the title after the type step makes the item a task with no date', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João todo dia às 8')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.type}`))
    await tap(tree, new RegExp(`^${ptBR.habits.form.typeTask}`))
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.when}`))
    await tap(tree, ptBR.habits.flow.when.noDate)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(sent().title).toBe('ligar para o João todo dia às 8')
    expect(sent()).not.toHaveProperty('frequencyUnit')
    tree.unmount()
  })

  it('gives the repeat of the date question its start day', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João')
    const words = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel)!
    await act(async () => { (words.props as unknown as { onChangeText: (value: string) => void }).onChangeText('todo dia'); await Promise.resolve() })
    const submit = tree.hosts().find((node) => node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel && typeof (node.props as { onSubmitEditing?: unknown }).onSubmitEditing === 'function')!
    await act(async () => { (submit.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
    await tap(tree, ptBR.habits.flow.time.none)
    await primary(tree)
    expect(sent()).toMatchObject({ title: 'ligar para o João', startDate: '2026-11-13', frequencyUnit: 'Day', frequencyQuantity: 1 })
    tree.unmount()
  })

  it('keeps the time of the phrase when the repeat of the date question carries no time', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João às 8')
    const words = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel)!
    await act(async () => { (words.props as unknown as { onChangeText: (value: string) => void }).onChangeText('todo dia'); await Promise.resolve() })
    const submit = tree.hosts().find((node) => node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel && typeof (node.props as { onSubmitEditing?: unknown }).onSubmitEditing === 'function')!
    await act(async () => { (submit.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
    await tap(tree, ptBR.habits.flow.reminder.no)
    await primary(tree)
    expect(sent()).toMatchObject({ title: 'ligar para o João', startDate: '2026-11-13', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
    tree.unmount()
  })

  it('marks the guessed repeat and time as proposals on their steps and stops marking each one when the person keeps it', async () => {
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.when.question)
    expect(proposedMarks(tree)).toBeGreaterThan(0)
    await primary(tree)
    expect(heading(tree)).toBe(ptBR.habits.flow.time.question)
    expect(proposedMarks(tree)).toBeGreaterThan(0)
    await primary(tree)
    await tap(tree, ptBR.habits.flow.reminder.no)
    const whenRow = new RegExp(`^${ptBR.habits.flow.summary.when}, `)
    const timeRow = new RegExp(`^${ptBR.habits.flow.summary.time}, 07:00$`)
    expect(control(tree, timeRow)).toBeDefined()
    expect(rowMarked(tree, whenRow)).toBe(false)
    expect(rowMarked(tree, timeRow)).toBe(false)
    tree.unmount()
  })

  it('stops marking the repeat and the cleared time as proposals when the person answers the When with a date', async () => {
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    expect(proposedMarks(tree)).toBeGreaterThan(0)
    await tap(tree, ptBR.habits.flow.when.tomorrow)
    expect(heading(tree)).toBe(ptBR.habits.flow.time.question)
    expect(proposedMarks(tree)).toBe(0)
    await tap(tree, ptBR.habits.flow.time.none)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.when}, `))).toBe(false)
    expect(control(tree, `${ptBR.habits.flow.summary.time}, ${ptBR.habits.flow.summary.noTime}`)).toBeDefined()
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.time}, `))).toBe(false)
    tree.unmount()
  })

  it('stops marking the time and the repeat as proposals when the person types them in the phrase after the read', async () => {
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.when.question)
    expect(proposedMarks(tree)).toBeGreaterThan(0)
    await tap(tree, ptBR.habits.flow.back)
    await phrase(tree, 'regar as plantas toda segunda às 9h')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    await tap(tree, ptBR.habits.flow.reminder.no)
    expect(control(tree, `${ptBR.habits.flow.summary.when}, toda segunda`)).toBeDefined()
    expect(control(tree, `${ptBR.habits.flow.summary.time}, 09:00`)).toBeDefined()
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.when}, `))).toBe(false)
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.time}, `))).toBe(false)
    tree.unmount()
  })

  it.each([['en', en, 'water the plants every monday at 9am', 'every Monday'], ['pt-BR', ptBR, 'regar as plantas toda segunda às 9h', 'toda segunda']] as const)(
    'names the chosen weekday on the summary and in the result sentence in %s', async (locale, words, typed, schedule) => {
      await i18n.changeLanguage(locale)
      state.create.mockResolvedValue({ id: 'habit-9' })
      state.saved = { id: 'habit-9', title: typed, isGeneral: false, dueDate: '2026-11-13', dueTime: '09:00', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: false, days: ['Monday'], monthDays: null, intervalWeeks: 1 }
      const tree = mountCreate()
      await settle()
      const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === words.habits.flow.what.label)!
      await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(typed); await Promise.resolve() })
      await primary(tree)
      await tap(tree, words.habits.flow.reminder.no)
      expect(control(tree, `${words.habits.flow.summary.when}, ${schedule}`)).toBeDefined()
      await primary(tree)
      expect(sent()).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], dueTime: '09:00' })
      await settle()
      const sentence = words.result.habit.repeatTimed.split('{')[0]!
      expect(tree.hosts().some((node) => typeof node.props.children === 'string' && node.props.children.startsWith(sentence) && node.props.children.includes(`${schedule} `))).toBe(true)
      tree.unmount()
    },
  )

  it.each([
    ['an emoji', { emoji: '🪴', dueTime: null }, false],
    ['a time', { emoji: null, dueTime: '07:00' }, true],
  ] as const)('never marks a repeat the person typed as a proposal when the free read gives the same repeat and %s', async (_label, extra, timeProposed) => {
    state.phraseRead.mockResolvedValue({ read: true, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [], ...extra })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas toda segunda')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    expect(heading(tree)).toBe(ptBR.habits.flow.time.question)
    expect(proposedMarks(tree) > 0).toBe(timeProposed)
    if (timeProposed) await primary(tree)
    else await tap(tree, ptBR.habits.flow.time.none)
    if (control(tree, ptBR.habits.flow.reminder.no)) await tap(tree, ptBR.habits.flow.reminder.no)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(control(tree, `${ptBR.habits.flow.summary.when}, toda segunda`)).toBeDefined()
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.when}, `))).toBe(false)
    expect(rowMarked(tree, new RegExp(`^${ptBR.habits.flow.summary.time}, `))).toBe(false)
    tree.unmount()
  })

  it('keeps a child of a General parent undated when the free read proposes a repeat and a time, and marks only the emoji', async () => {
    state.phraseRead.mockResolvedValue({ read: true, emoji: '🪴', frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const parent = createMockHabit({ id: 'parent-1', title: 'Casa', isGeneral: true, frequencyUnit: null, frequencyQuantity: null, dueTime: null })
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} parentHabit={parent} /></QueryClientProvider>)
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    if (control(tree, ptBR.habits.flow.time.none)) await tap(tree, ptBR.habits.flow.time.none)
    if (control(tree, ptBR.habits.flow.reminder.no)) await tap(tree, ptBR.habits.flow.reminder.no)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    const rowTitles = [ptBR.habits.flow.summary.when, ptBR.habits.flow.summary.time]
    const titlesIn = (nodes: ReactTestInstance[]) => nodes.map((node) => (node.props as { children?: unknown }).children).filter((text): text is string => typeof text === 'string' && rowTitles.includes(text))
    expect(titlesIn(tree.hosts() as unknown as ReactTestInstance[])).toEqual([ptBR.habits.flow.summary.when])
    const markedRows = tree.hosts().filter((node) => node.props.testID === 'proposed-row') as unknown as ReactTestInstance[]
    expect(markedRows.flatMap((node) => titlesIn(node.findAll((child) => typeof child.type === 'string')))).toEqual([])
    await primary(tree)
    expect(state.subCreate).toHaveBeenCalledTimes(1)
    const sent = (state.subCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(sent).toMatchObject({ title: 'regar as plantas', emoji: '🪴' })
    expect(sent).not.toHaveProperty('frequencyUnit')
    expect(sent).not.toHaveProperty('dueTime')
    expect(sent).not.toHaveProperty('dueDate')
    tree.unmount()
  })

  it.each([
    ['the day', ptBR.habits.flow.when.tomorrow, { read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] }, { dueDate: '2026-11-14' }],
    ['the repeat', ptBR.habits.flow.when.everyDay, { read: true, emoji: null, frequencyUnit: 'Week', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }, { startDate: '2026-11-13', frequencyUnit: 'Day', frequencyQuantity: 1 }],
  ] as const)('keeps %s the person answered when a later free read of the phrase proposes a repeat', async (_label, answer, laterRead, expected) => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    state.phraseRead
      .mockResolvedValueOnce({ read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
      .mockResolvedValueOnce(laterRead)
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para a mãe')
    await settle()
    await tap(tree, answer)
    await tap(tree, ptBR.habits.flow.time.none)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    const whenRow = new RegExp(`^${ptBR.habits.flow.summary.when}, `)
    const answered = control(tree, whenRow)!.props.accessibilityLabel
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.title}`))
    await phrase(tree, 'ligar para a mãe e perguntar da viagem')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(2)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(control(tree, whenRow)!.props.accessibilityLabel).toBe(answered)
    expect(rowMarked(tree, whenRow)).toBe(false)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    const sent = state.create.mock.calls[0]![0] as Record<string, unknown>
    expect(sent).toMatchObject({ title: 'ligar para a mãe e perguntar da viagem', ...expected })
    expect(sent.days ?? []).toEqual([])
    expect(sent).not.toHaveProperty('dueTime')
    if (!('frequencyUnit' in expected)) expect(sent).not.toHaveProperty('frequencyUnit')
    tree.unmount()
  })

  const MISSED_READ: HabitPhraseReadResponse = { read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }
  const DAILY_READ: HabitPhraseReadResponse = { ...MISSED_READ, read: true, emoji: '🪴', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }
  const LATER_READ: HabitPhraseReadResponse = { ...MISSED_READ, read: true, emoji: '🌿', frequencyUnit: 'Week', frequencyQuantity: 1, days: ['Monday'], dueTime: '18:00' }
  const flow = ptBR.habits.flow
  const typeIn = async (tree: Tree, label: string, text: string) => {
    const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === label)!
    await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
  }
  interface SummaryAfter { when: string; whenProposed: boolean; time: string | null; timeProposed: boolean; sent: Record<string, unknown>; absent: string[] }
  const expectSummaryRows = (tree: Tree, after: SummaryAfter) => {
    const whenRow = new RegExp(`^${flow.summary.when}, `)
    const timeRow = new RegExp(`^${flow.summary.time}, `)
    const timeControl = control(tree, timeRow)
    expect({ when: control(tree, whenRow)!.props.accessibilityLabel, whenProposed: rowMarked(tree, whenRow), time: timeControl?.props.accessibilityLabel ?? null, timeProposed: timeControl ? rowMarked(tree, timeRow) : false })
      .toEqual({ when: `${flow.summary.when}, ${after.when}`, whenProposed: after.whenProposed, time: after.time === null ? null : `${flow.summary.time}, ${after.time}`, timeProposed: after.timeProposed })
  }
  const SET_ON_A_STEP: [string, HabitPhraseReadResponse, (tree: Tree) => Promise<void>, SummaryAfter][] = [
    ['"No date" on the When step', MISSED_READ, async (tree) => { await tap(tree, flow.when.noDate) },
      { when: flow.summary.noDate, whenProposed: false, time: null, timeProposed: false, sent: { isGeneral: true, emoji: '🌿' }, absent: ['dueTime', 'frequencyUnit', 'dueDate'] }],
    ['"Tomorrow" on the When step', MISSED_READ, async (tree) => { await tap(tree, flow.when.tomorrow); await tap(tree, flow.time.none) },
      { when: '14/11/2026', whenProposed: false, time: flow.summary.noTime, timeProposed: false, sent: { dueDate: '2026-11-14', emoji: '🌿' }, absent: ['dueTime', 'frequencyUnit'] }],
    ['a repeat in the words of the When step', MISSED_READ, async (tree) => {
      await typeIn(tree, flow.when.freeLabel, 'toda sexta')
      const submit = tree.hosts().find((node) => node.props.accessibilityLabel === flow.when.freeLabel && typeof (node.props as { onSubmitEditing?: unknown }).onSubmitEditing === 'function')!
      await act(async () => { (submit.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
      await tap(tree, flow.time.none)
    }, { when: 'toda sexta', whenProposed: false, time: flow.summary.noTime, timeProposed: false, sent: { frequencyUnit: 'Day', days: ['Friday'], emoji: '🌿' }, absent: ['dueTime'] }],
    ['"Quando der" on the repeat step', DAILY_READ, async (tree) => {
      await keepProposedAnswersToSummary(tree)
      await tap(tree, new RegExp(`^${flow.summary.when}, `))
      await tap(tree, new RegExp(`^${flow.repeat.timesIn}`))
      await primary(tree)
    }, { when: 'uma vez ao dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { isFlexible: true, frequencyUnit: 'Day', dueTime: '07:00' }, absent: ['days'] }],
    ['a time on the time step', DAILY_READ, async (tree) => {
      await keepProposedAnswersToSummary(tree)
      await tap(tree, new RegExp(`^${flow.summary.time}, `))
      await tap(tree, '20:00')
    }, { when: 'todo dia', whenProposed: false, time: '20:00', timeProposed: false, sent: { frequencyUnit: 'Day', dueTime: '20:00' }, absent: [] }],
    ['an end time on the duration step', DAILY_READ, async (tree) => {
      await keepProposedAnswersToSummary(tree)
      await tap(tree, new RegExp(`^${flow.summary.duration}, `))
      await typeIn(tree, ptBR.habits.form.dueEndTime, '08:30')
      await primary(tree)
    }, { when: 'todo dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { frequencyUnit: 'Day', dueTime: '07:00', dueEndTime: '08:30' }, absent: [] }],
    ['an emoji on the emoji step', DAILY_READ, async (tree) => {
      await keepProposedAnswersToSummary(tree)
      await tap(tree, ptBR.habits.form.emojiOpenPicker)
      await tap(tree, `${ptBR.habits.form.emoji}: 💧`)
    }, { when: 'todo dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { frequencyUnit: 'Day', dueTime: '07:00', emoji: '💧' }, absent: [] }],
  ]

  it.each(SET_ON_A_STEP)('keeps %s when a later free read of a new phrase proposes other values, and the summary shows what the save sends', async (_step, firstRead, setOnStep, after) => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    state.phraseRead.mockResolvedValueOnce(firstRead).mockResolvedValueOnce(LATER_READ)
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    await setOnStep(tree)
    expect(heading(tree)).toBe(flow.confirm.question)
    await tap(tree, new RegExp(`^${flow.summary.title}`))
    await phrase(tree, 'regar as plantas do jardim')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(2)
    expect(heading(tree)).toBe(flow.confirm.question)
    expectSummaryRows(tree, after)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    const sent = state.create.mock.calls[0]![0] as Record<string, unknown>
    expect(sent).toMatchObject({ title: 'regar as plantas do jardim', ...after.sent })
    for (const field of after.absent) expect(sent).not.toHaveProperty(field)
    tree.unmount()
  })

  const ONE_TIME_READ: HabitPhraseReadResponse = { ...MISSED_READ, read: true, emoji: '🌿', dueTime: '07:00' }
  const EVERY_DAY_READ: HabitPhraseReadResponse = { ...ONE_TIME_READ, frequencyUnit: 'Day', frequencyQuantity: 1 }
  const TYPED_IN_THE_PHRASE: [string, string, HabitPhraseReadResponse, SummaryAfter][] = [
    ['a time', 'regar as plantas às 9h', EVERY_DAY_READ,
      { when: 'todo dia', whenProposed: false, time: '09:00', timeProposed: false, sent: { title: 'regar as plantas', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '09:00', emoji: '🌿' }, absent: ['days'] }],
    ['a repeat', 'regar as plantas 3 vezes por semana', EVERY_DAY_READ,
      { when: '3 vezes por semana, qualquer dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'regar as plantas', isFlexible: true, frequencyUnit: 'Week', frequencyQuantity: 3, dueTime: '07:00', emoji: '🌿' }, absent: ['days'] }],
    ['a day', 'regar as plantas toda segunda', EVERY_DAY_READ,
      { when: 'toda segunda', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'regar as plantas', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], dueTime: '07:00', emoji: '🌿' }, absent: [] }],
    ['an emoji', '💧 regar as plantas', EVERY_DAY_READ,
      { when: 'todo dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: '💧 regar as plantas', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00' }, absent: ['emoji'] }],
    ['the type', 'regar as plantas toda segunda', ONE_TIME_READ,
      { when: 'toda segunda', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'regar as plantas', frequencyUnit: 'Day', days: ['Monday'], dueTime: '07:00', emoji: '🌿' }, absent: [] }],
    ['a date', 'ligar para a mãe amanhã', EVERY_DAY_READ,
      { when: '14/11/2026', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'ligar para a mãe', dueDate: '2026-11-14', dueTime: '07:00', emoji: '🌿' }, absent: ['frequencyUnit', 'startDate'] }],
    ['a bare interval', 'regar as plantas a cada 2 semanas', EVERY_DAY_READ,
      { when: 'a cada 2 semanas', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'regar as plantas', frequencyUnit: 'Week', frequencyQuantity: 2, dueTime: '07:00', emoji: '🌿' }, absent: ['days'] }],
    ['no emoji when the phrase holds only a text sign', 'comprar Coca-Cola® zero', EVERY_DAY_READ,
      { when: 'todo dia', whenProposed: false, time: '07:00', timeProposed: false, sent: { title: 'comprar Coca-Cola® zero', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '07:00', emoji: '🌿' }, absent: ['days'] }],
  ]

  it.each(TYPED_IN_THE_PHRASE)('keeps %s the person typed in the phrase when the free read of that phrase proposes another value, and the summary and the title show what the save sends', async (_field, typed, read, after) => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    state.phraseRead.mockResolvedValue(read)
    const tree = mountCreate()
    await settle()
    await phrase(tree, typed)
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    await keepProposedAnswersToSummary(tree)
    expect(heading(tree)).toBe(flow.confirm.question)
    expectSummaryRows(tree, after)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    const sent = state.create.mock.calls[0]![0] as Record<string, unknown>
    expect(sent).toMatchObject(after.sent)
    for (const field of after.absent) expect(sent).not.toHaveProperty(field)
    tree.unmount()
  })

  it('reads a repeat typed in the phrase after the person makes a task a habit on the type step', async () => {
    state.create.mockResolvedValue({ id: 'habit-9' })
    state.phraseRead.mockResolvedValue({ read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João')
    await settle()
    await tap(tree, ptBR.habits.flow.when.tomorrow)
    await tap(tree, '08:00')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.type}`))
    await tap(tree, new RegExp(`^${ptBR.habits.form.typeHabit}`))
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.title}`))
    await phrase(tree, 'ligar para o João toda segunda')
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'ligar para o João', startDate: '2026-11-14', frequencyUnit: 'Day', days: ['Monday'], dueTime: '08:00' })
    tree.unmount()
  })

  it('stops marking the time as a proposal on the summary when the date words replace the time the free read proposed', async () => {
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'regar as plantas')
    await settle()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    const words = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel)!
    await act(async () => { (words.props as unknown as { onChangeText: (value: string) => void }).onChangeText('todo dia às 9'); await Promise.resolve() })
    const submit = tree.hosts().find((node) => node.props.accessibilityLabel === ptBR.habits.flow.when.freeLabel && typeof (node.props as { onSubmitEditing?: unknown }).onSubmitEditing === 'function')!
    await act(async () => { (submit.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
    await tap(tree, ptBR.habits.flow.reminder.no)
    expect(control(tree, `${ptBR.habits.flow.summary.time}, 09:00`)).toBeDefined()
    expect(hasTestId(tree, 'proposed-row-label')).toBe(false)
    tree.unmount()
  })

  it('states a refused save on the summary and sends nothing, when an undated task becomes a habit with no start day', async () => {
    const tree = mountCreate()
    await settle()
    await phrase(tree, 'ligar para o João')
    await tap(tree, ptBR.habits.flow.when.noDate)
    await tap(tree, new RegExp(`^${ptBR.habits.flow.summary.type}`))
    await tap(tree, new RegExp(`^${ptBR.habits.form.typeHabit}`))
    await primary(tree)
    expect(state.create).not.toHaveBeenCalled()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(alertText(tree)).toEqual([ptBR.habits.form.dateStale])
    tree.unmount()
  })
})

function discardSheetAncestors(tree: Tree): string[] {
  const title = tree.hosts().find((node) => node.props.children === ptBR.common.discardChangesTitle) as unknown as ReactTestInstance | undefined
  if (!title) return []
  const testIds: string[] = []
  for (let node = title.parent; node; node = node.parent) if (typeof node.props.testID === 'string') testIds.push(node.props.testID)
  return testIds
}

describe('the discard sheet of a guided habit flow on Android', () => {
  it('opens inside the flow screen above the guided create, because a sheet beside the flow modal lands under it', async () => {
    const tree = mountCreate()
    await settle()
    expect(discardSheetAncestors(tree)).toEqual([])
    await phrase(tree, 'Beber água')
    await tap(tree, ptBR.habits.flow.close)
    expect(discardSheetAncestors(tree)).toContain('flow-screen')
    tree.unmount()
  })

  it('opens inside the flow screen above the guided edit', async () => {
    const tree = mountEdit()
    await settle()
    await tap(tree, /^Hora,/)
    await tap(tree, '20:00')
    await tap(tree, ptBR.habits.flow.close)
    expect(discardSheetAncestors(tree)).toContain('flow-screen')
    tree.unmount()
  })
})

describe('the result dialog of a guided create on the Android create screen', () => {
  function mountScreen() {
    const log = { removalBlocked: true, blockedAtNavigation: [] as boolean[] }
    function LeaveGuard({ leaving }: Readonly<{ leaving: boolean; requestLeave: () => void }>) {
      log.removalBlocked = !leaving
      return null
    }
    state.replace.mockImplementation(() => { log.blockedAtNavigation.push(log.removalBlocked) })
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open presentation="screen" leaveGuard={LeaveGuard} onClose={onClose} onCreated={onCreated} /></QueryClientProvider>)
    return { tree, log, onClose, onCreated }
  }
  async function tapText(tree: Tree, label: string) {
    const target = tree.hosts().find((node) => typeof node.props.onPress === 'function' && (node as unknown as ReactTestInstance).findAll((child) => child.props.children === label).length > 0)
    if (!target) throw new Error('no control with the text ' + label)
    await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
  }
  async function save(tree: Tree, when: string) {
    state.create.mockResolvedValue({ id: 'habit-1' })
    await settle()
    await phrase(tree, 'pagar a internet')
    await tap(tree, when)
    await tap(tree, '08:00')
    await tap(tree, ptBR.habits.flow.reminder.no)
    await primary(tree)
    expect(hasTestId(tree, 'result-dialog')).toBe(true)
  }

  it('opens Hoje as the leave action of the create screen with no discard sheet', async () => {
    const { tree, log, onClose, onCreated } = mountScreen()
    await save(tree, ptBR.habits.flow.when.today)
    await tapText(tree, ptBR.result.seeToday)
    expect(state.replace.mock.calls).toEqual([['/(tabs)']])
    expect(log.blockedAtNavigation).toEqual([false])
    expect(state.push).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it('restarts the flow on Criar outro and does not navigate', async () => {
    const { tree, onClose } = mountScreen()
    await save(tree, ptBR.habits.flow.when.today)
    await tapText(tree, ptBR.result.createAnother)
    expect(state.replace).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(hasTestId(tree, 'result-dialog')).toBe(false)
    tree.unmount()
  })

  it('leaves through the scrim with no navigation', async () => {
    const { tree, onClose, onCreated } = mountScreen()
    await save(tree, ptBR.habits.flow.when.today)
    const scrim = tree.hosts().find((node) => node.props.testID === 'result-dialog-scrim')!
    await act(async () => { press(scrim); await Promise.resolve() })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onCreated).toHaveBeenCalledOnce()
    expect(state.replace).not.toHaveBeenCalled()
    tree.unmount()
  })
})

describe('the Android edit surface', () => {
  const discardShown = (tree: Tree) => tree.hosts().some((node) => node.props.children === ptBR.common.discardChangesTitle)
  async function tapText(tree: Tree, label: string) {
    const target = tree.hosts().find((node) => typeof node.props.onPress === 'function' && (node as unknown as ReactTestInstance).findAll((child) => child.props.children === label).length > 0)
    if (!target) throw new Error('no control with the text ' + label)
    await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
  }

  it('closes an unchanged edit with no discard sheet', async () => {
    state.saved = { ...storedHabit, children: [] }
    const onClose = vi.fn()
    const tree = mountEdit(onClose)
    await settle()
    await tap(tree, ptBR.habits.flow.close)
    expect(discardShown(tree)).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it('asks before it discards a changed edit, keeps the change on Keep editing and closes only on discard', async () => {
    state.saved = { ...storedHabit, children: [] }
    const onClose = vi.fn()
    const tree = mountEdit(onClose)
    await settle()
    await tap(tree, /^Hora,/)
    await tap(tree, '20:00')
    await tap(tree, ptBR.habits.flow.close)
    expect(discardShown(tree)).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    await tapText(tree, ptBR.common.keepEditing)
    expect(discardShown(tree)).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    await tap(tree, ptBR.habits.flow.close)
    await tapText(tree, ptBR.common.discardChangesAction)
    expect(onClose).toHaveBeenCalledOnce()
    expect(state.update).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('opens Upgrade from the slip alert step of a free plan after the sheet closes', async () => {
    state.pro = false
    state.saved = { ...storedHabit, children: [] }
    const onClose = vi.fn()
    const tree = mountEdit(onClose)
    await settle()
    await tap(tree, 'Quer ajustar mais alguma coisa?')
    await tap(tree, /^É algo que você quer largar/)
    await tap(tree, ptBR.habits.flow.optional.yes)
    await tapText(tree, ptBR.habits.form.slipAlert)
    expect(state.push.mock.calls).toEqual([['/upgrade']])
    expect(onClose).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it('opens on the summary, saves the time change only and closes with the result dialog for the change', async () => {
    state.saved = { ...storedHabit, dueTime: '20:00', children: [] }
    const tree = mountEdit()
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    await tap(tree, /^Hora,/)
    await tap(tree, '20:00')
    await primary(tree)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(state.update).toHaveBeenCalledTimes(1)
    expect((state.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '20:00' })
    expect(state.completed).toHaveBeenCalledWith('habit_edit', 1, false)
    expect(tree.hosts().some((node) => node.props.children === ptBR.result.habit.updated)).toBe(true)
    expect(nativeWindows(tree), 'the result draws in the window of the flow, so iOS presents one Modal').toHaveLength(1)
    tree.unmount()
  })

  describe.each([
    ['a clock reminder', { scheduledReminders: [{ when: 'same_day' as const, time: '06:30' }], repeatReminder: null }],
    ['a repeat reminder', { scheduledReminders: [], repeatReminder: { intervalMinutes: 30, activeStart: '08:00', activeEnd: '20:00' } }],
  ])('answering no set time on %s', (_name, stored) => {
    it('keeps the stored reminder in the save and on the summary', async () => {
      const habit = createMockHabit({ ...storedHabit, reminderEnabled: true, reminderTimes: [], ...stored })
      const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onClose={vi.fn()} habit={habit} /></QueryClientProvider>)
      await settle()
      expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
      await tap(tree, /^Hora,/)
      await tap(tree, ptBR.habits.flow.time.none)
      expect(control(tree, /^Lembrete,/)?.props.accessibilityLabel).toContain(ptBR.habits.flow.summary.withReminder)
      await primary(tree)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      const { data } = state.update.mock.calls[0]![0] as { data: Record<string, unknown> }
      expect(data).not.toHaveProperty('dueTime')
      expect(data).toMatchObject({ reminderEnabled: true })
      if (habit.repeatReminder) {
        expect(data).not.toHaveProperty('clearRepeatReminder')
        expect(data.repeatReminder).toEqual(habit.repeatReminder)
      } else expect(data.scheduledReminders).toEqual(habit.scheduledReminders)
      tree.unmount()
    })
  })

  it('states no reminder on the summary and sends none when only offset reminders remain after no set time', async () => {
    const habit = createMockHabit({ ...storedHabit, reminderEnabled: true, reminderTimes: [15], scheduledReminders: [], repeatReminder: null })
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onClose={vi.fn()} habit={habit} /></QueryClientProvider>)
    await settle()
    await tap(tree, /^Hora,/)
    await tap(tree, ptBR.habits.flow.time.none)
    expect(control(tree, /^Lembrete,/)?.props.accessibilityLabel).toContain(ptBR.habits.flow.summary.noReminder)
    await primary(tree)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const { data } = state.update.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(data).toMatchObject({ reminderEnabled: false, scheduledReminders: [], relativeReminders: [] })
    tree.unmount()
  })

  const summarySkeleton = (tree: Tree) => tree.hosts().find((node) => node.props.testID === 'summary-skeleton')
  const saveAction = (tree: Tree) => tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && node.props.accessibilityState !== undefined)
  const alerts = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'alert')

  it('shows a skeleton for each summary row while the stored details load, with no spinner and the save waiting on its label', async () => {
    state.detailPending = true
    state.detailFetching = true
    const tree = mountEdit()
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    const skeleton = summarySkeleton(tree)
    expect(skeleton?.props.accessibilityState).toMatchObject({ busy: true })
    expect(skeleton?.props.accessibilityLabel).toBe(ptBR.common.loading)
    expect(tree.hosts().filter((node) => node.props.testID === 'skeleton-unit-fill').length).toBeGreaterThan(1)
    expect(control(tree, /^Hora,/)).toBeUndefined()
    expect(control(tree, ptBR.habits.flow.more)).toBeUndefined()
    expect(tree.hosts().some((node) => node.type === 'ActivityIndicator')).toBe(false)
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: false, busy: true })
    expect(tree.hosts().some((node) => node.type === 'Text' && node.props.children === ptBR.common.save)).toBe(true)
    await act(async () => { saveAction(tree)?.props.onPress?.(); await Promise.resolve() })
    expect(state.update).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('states a failed detail read on the summary with a retry, keeps the save off and sends nothing', async () => {
    state.detailError = new Error('offline')
    const tree = mountEdit()
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(summarySkeleton(tree)).toBeUndefined()
    expect(alerts(tree)).toHaveLength(1)
    expect(control(tree, /^Hora,/)).toBeUndefined()
    expect(control(tree, ptBR.habits.flow.more)).toBeUndefined()
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => { saveAction(tree)?.props.onPress?.(); await Promise.resolve() })
    expect(state.update).not.toHaveBeenCalled()
    await tap(tree, ptBR.common.retry)
    expect(state.refetchDetail).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('states a detail read that never starts on the summary with a retry, never a skeleton that does not end', async () => {
    state.detailPending = true
    const tree = mountEdit()
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(summarySkeleton(tree)).toBeUndefined()
    expect(alerts(tree)).toHaveLength(1)
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: true })
    await act(async () => { saveAction(tree)?.props.onPress?.(); await Promise.resolve() })
    expect(state.update).not.toHaveBeenCalled()
    await tap(tree, ptBR.common.retry)
    expect(state.refetchDetail).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('never holds the summary of a habit created offline, whose list record is the whole record', async () => {
    state.detailPending = true
    const habit = createMockHabit({ ...storedHabit, id: 'offline-habit-7' })
    const tree = renderNavigation(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onClose={vi.fn()} habit={habit} /></QueryClientProvider>)
    await settle()
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(summarySkeleton(tree)).toBeUndefined()
    expect(alerts(tree)).toHaveLength(0)
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: false })
    expect(saveAction(tree)?.props.accessibilityState).not.toMatchObject({ busy: true })
    tree.unmount()
  })

  it('shows the skeleton again while the retry of a failed detail read runs', async () => {
    state.detailError = new Error('offline')
    state.detailFetching = true
    const tree = mountEdit()
    await settle()
    expect(summarySkeleton(tree)).toBeDefined()
    expect(alerts(tree)).toHaveLength(0)
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: false, busy: true })
    tree.unmount()
  })

  describe('a save that loses its response', () => {
    const shows = (tree: Tree, text: string) => tree.hosts().some((node) => node.props.children === text)
    async function changeTimeAndSave(tree: Tree) {
      await settle()
      expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
      await tap(tree, /^Hora,/)
      await tap(tree, '20:00')
      await primary(tree)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    }

    it('keeps the draft, asks for a fresh readback and retries only after the readback answers', async () => {
      state.update.mockRejectedValue(new Error('timeout'))
      const onClose = vi.fn()
      const tree = mountEdit(onClose)
      await changeTimeAndSave(tree)
      expect(state.update).toHaveBeenCalledTimes(1)
      expect(state.refetchDetail).toHaveBeenCalledTimes(1)
      expect(shows(tree, ptBR.habits.form.saveUncertain)).toBe(true)
      expect(shows(tree, ptBR.result.habit.updated)).toBe(false)
      expect(onClose).not.toHaveBeenCalled()
      expect(control(tree, /^Hora,/)?.props.accessibilityLabel).toContain('20:00')
      state.update.mockResolvedValue({})
      state.saved = { ...storedHabit, dueTime: '20:00', children: [] }
      state.refetchDetail.mockResolvedValueOnce({ isSuccess: true, data: { ...storedHabit, parentId: null } })
      await primary(tree)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      expect(state.update).toHaveBeenCalledTimes(2)
      expect(state.refetchDetail.mock.invocationCallOrder[1]).toBeLessThan(state.update.mock.invocationCallOrder[1]!)
      expect(shows(tree, ptBR.result.habit.updated)).toBe(true)
      expect(shows(tree, ptBR.habits.form.saveUncertain)).toBe(false)
      tree.unmount()
    })

    it('refuses the retry while the authoritative readback is unavailable', async () => {
      state.update.mockRejectedValue(new Error('timeout'))
      state.refetchDetail.mockResolvedValue({ isSuccess: false, data: { ...storedHabit, parentId: null } })
      const tree = mountEdit()
      await changeTimeAndSave(tree)
      expect(state.update).toHaveBeenCalledTimes(1)
      await primary(tree)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      expect(state.update).toHaveBeenCalledTimes(1)
      expect(control(tree, /^Hora,/)?.props.accessibilityLabel).toContain('20:00')
      expect(shows(tree, ptBR.habits.form.saveUncertain)).toBe(true)
      tree.unmount()
    })

    it.each([[500], [408]])('treats a %i answer as a save with an unknown outcome', async (status) => {
      state.update.mockRejectedValue(createApiClientError(status, {}, 'Failed'))
      const tree = mountEdit()
      await changeTimeAndSave(tree)
      expect(state.refetchDetail).toHaveBeenCalledTimes(1)
      expect(shows(tree, ptBR.habits.form.saveUncertain)).toBe(true)
      tree.unmount()
    })

    it('states a definitive refusal with its own message and asks for no readback', async () => {
      state.update.mockRejectedValue(createApiClientError(409, { errorCode: 'CONCURRENT_UPDATE_CONFLICT' }, 'Conflict'))
      const tree = mountEdit()
      await changeTimeAndSave(tree)
      expect(state.refetchDetail).not.toHaveBeenCalled()
      expect(shows(tree, ptBR.habits.form.saveUncertain)).toBe(false)
      tree.unmount()
    })
  })

  it('shows the stored values and an enabled save once the details load', async () => {
    state.saved = { ...storedHabit, parentId: null, children: [], endDate: null }
    const tree = mountEdit()
    await settle()
    expect(summarySkeleton(tree)).toBeUndefined()
    expect(control(tree, /^Hora,/)).toBeDefined()
    expect(saveAction(tree)?.props.accessibilityState).toMatchObject({ disabled: false })
    tree.unmount()
  })
})
