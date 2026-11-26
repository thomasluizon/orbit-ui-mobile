import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockGoal, createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { i18n } from '@/lib/i18n'
import { nativeWindows, press, renderNavigation } from '../ui/navigation-render'

const inventory = vi.hoisted(() => ({ read: vi.fn() }))
const state = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(), showError: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, replace: state.replace, back: vi.fn(), canGoBack: () => true }), useIsFocused: () => true, useLocalSearchParams: () => ({}) }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: true } }),
  useHasProAccess: () => true,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: state.showError, showSuccess: vi.fn(), showInfo: vi.fn() }) }))
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
  useTags: () => ({ tags: [{ id: 'tag-1', name: 'Saúde', color: '#7c3aed' }] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: () => null,
  useLinkableGoals: () => ({ data: [createMockGoal({ id: 'goal-1', title: 'Correr 5 km', progressPercentage: 40 }), createMockGoal({ id: 'goal-2', title: 'Ler 12 livros', progressPercentage: 10 })], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api-client')>(), apiClient: inventory.read }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
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

const flow = ptBR.habits.flow
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rowNamed = (question: string) => new RegExp('^' + escapeRegExp(question))
const storedHabit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00', reminderEnabled: false, tags: [], linkedGoals: [] })

type EditProps = Partial<React.ComponentProps<typeof EditHabitModal>>
function Edit({ client, ...props }: Readonly<EditProps & { client: QueryClient }>) {
  return <QueryClientProvider client={client}><EditHabitModal open onClose={vi.fn()} habit={storedHabit} {...props} /></QueryClientProvider>
}
function mountEdit(props: EditProps = {}) {
  const client = new QueryClient()
  const tree = renderNavigation(<Edit client={client} {...props} />)
  return { tree, rerender: async (next: EditProps) => { await act(async () => { tree.update(<Edit client={client} {...props} {...next} />); await Promise.resolve() }) } }
}
async function openOptional(tree: Tree, question: string) {
  await tap(tree, flow.more)
  await tap(tree, rowNamed(question))
  expect(heading(tree)).toBe(question)
}
async function toSummaryAfter(tree: Tree, question: string, choose: () => Promise<void>) {
  await settle()
  await openOptional(tree, question)
  await choose()
  await primary(tree)
  await primary(tree)
  expect(heading(tree)).toBe(flow.confirm.question)
}
const updateData = () => (state.update.mock.calls[0]![0] as { habitId: string; data: Record<string, unknown> }).data
async function saveTime(tree: Tree) {
  await tap(tree, /^Hora,/)
  await tap(tree, '20:00')
  await primary(tree)
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.update.mockReset().mockResolvedValue({})
  state.completed.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.saved = null
  state.detailPending = false
  state.detailFetching = false
  state.detailError = null
  inventory.read.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe('the edit save payload of the guided edit on Android', () => {
  it('sends the tag chosen on the tag step in the one update', async () => {
    const { tree } = mountEdit()
    await toSummaryAfter(tree, flow.optional.tags, () => tap(tree, 'Saúde'))
    await primary(tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().tagIds).toEqual(['tag-1'])
    tree.unmount()
  })

  it('sends the goal chosen on the goal step in the one update', async () => {
    const { tree } = mountEdit()
    await toSummaryAfter(tree, flow.optional.goals, () => tap(tree, /^Ler 12 livros/))
    await primary(tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().goalIds).toEqual(['goal-2'])
    tree.unmount()
  })

  it('sends the stored tags and goals untouched when only the time changes', async () => {
    const { tree } = mountEdit({ habit: createMockHabit({ ...storedHabit, tags: [{ id: 'tag-1', name: 'Saúde', color: '#7c3aed' }], linkedGoals: [{ id: 'goal-1', title: 'Correr 5 km' }] }) })
    await settle()
    await saveTime(tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData()).toMatchObject({ dueTime: '20:00', tagIds: ['tag-1'], goalIds: ['goal-1'] })
    tree.unmount()
  })

  it('omits every relationship write when an unrelated field is saved before the authority loads', async () => {
    const { tree } = mountEdit({ relationshipFieldsLoaded: false })
    await settle()
    await saveTime(tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    const data = updateData()
    expect(data).toMatchObject({ dueTime: '20:00' })
    expect(data).not.toHaveProperty('goalIds')
    expect(data).not.toHaveProperty('tagIds')
    expect(data).not.toHaveProperty('slipAlertEnabled')
    tree.unmount()
  })

  it('replays a goal chosen before the authority loads onto the authoritative goals', async () => {
    const view = mountEdit({ relationshipFieldsLoaded: false })
    await toSummaryAfter(view.tree, flow.optional.goals, () => tap(view.tree, /^Ler 12 livros/))
    await view.rerender({ relationshipFieldsLoaded: true, habit: createMockHabit({ ...storedHabit, linkedGoals: [{ id: 'goal-1', title: 'Correr 5 km' }] }) })
    await primary(view.tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().goalIds).toEqual(['goal-1', 'goal-2'])
    view.tree.unmount()
  })

  it('leaves the parent out of the update when it did not change', async () => {
    state.saved = { ...storedHabit, parentId: null, children: [] }
    const { tree } = mountEdit()
    await settle()
    await saveTime(tree)
    expect(updateData()).not.toHaveProperty('parentId')
    expect(updateData()).not.toHaveProperty('clearParent')
    tree.unmount()
  })

  it.each([
    ['moves the habit into the parent chosen on the parent step', null, 'Rotina da manhã', { parentId: 'parent-1' }],
    ['clears the parent when the person picks the top level', 'parent-1', 'Sem hábito principal (nível raiz)', { clearParent: true }],
  ] as const)('the parent change that %s sends only that change in the update', async (_name, baselineParent, choice, expected) => {
    const parent = createMockHabitScheduleItem({ id: 'parent-1', title: 'Rotina da manhã', children: [] })
    const source = createMockHabitScheduleItem({ ...storedHabit, children: [] })
    inventory.read.mockImplementation((url: string) => Promise.resolve({ items: new URL(url, 'https://fixture.invalid').searchParams.get('isGeneral') === 'true' ? [] : [parent, source], page: 1, pageSize: 200, totalCount: 2, totalPages: 1 }))
    state.saved = { ...storedHabit, parentId: baselineParent, children: [] }
    const { tree } = mountEdit()
    await toSummaryAfter(tree, flow.optional.parent, async () => {
      await tap(tree, rowNamed(flow.optional.parentRow))
      await act(async () => { await vi.advanceTimersByTimeAsync(50) })
      await tap(tree, new RegExp('^' + escapeRegExp(choice)))
      await tap(tree, 'attempt-dismiss')
    })
    await primary(tree)
    expect(state.update).toHaveBeenCalledTimes(1)
    const data = updateData()
    expect(data).toMatchObject(expected)
    expect(Object.keys(data).filter((key) => key === 'parentId' || key === 'clearParent')).toEqual(Object.keys(expected))
    tree.unmount()
  })
})
