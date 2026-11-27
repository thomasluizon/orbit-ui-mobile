import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { i18n } from '@/lib/i18n'
import { nativeWindows, press, renderNavigation } from '../ui/navigation-render'

const inventory = vi.hoisted(() => ({ read: vi.fn() }))
const state = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(), showError: vi.fn(), pro: true,
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

function mountCreate() {
  return renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} /></QueryClientProvider>)
}
async function openOptional(tree: Tree, question: string) {
  await tap(tree, flow.more)
  await tap(tree, rowNamed(question))
  expect(heading(tree)).toBe(question)
}
async function backToSummary(tree: Tree) {
  for (let guard = 0; guard < 3 && heading(tree) !== flow.confirm.question; guard += 1) await primary(tree)
  expect(heading(tree)).toBe(flow.confirm.question)
}
async function toSummary(tree: Tree) {
  await settle()
  await phrase(tree, 'ler todo dia às 8')
  await tap(tree, flow.reminder.no)
  expect(heading(tree)).toBe(flow.confirm.question)
}
const createRequest = () => state.create.mock.calls[0]![0] as Record<string, unknown>

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.pro = true
  state.create.mockReset().mockResolvedValue({ id: 'habit-9' })
  state.completed.mockReset()
  state.push.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.saved = null
  inventory.read.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe('the create request of the guided create on Android', () => {
  it('sends the goal linked on the goal step in the one create request', async () => {
    const tree = mountCreate()
    await toSummary(tree)
    await openOptional(tree, flow.optional.goals)
    await tap(tree, 'Ler 12 livros, 10%')
    await backToSummary(tree)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(createRequest().goalIds).toEqual(['goal-2'])
    tree.unmount()
  })

  it('sends the sub-habit typed on the sub-habit step in the one create request, on a Free plan with no gate', async () => {
    state.pro = false
    const tree = mountCreate()
    await toSummary(tree)
    await openOptional(tree, flow.optional.subHabits)
    await tap(tree, ptBR.habits.form.addSubHabit)
    const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.form.subHabitInputLabel.replace('{{index}}', '1').replace('{index}', '1'))
    if (!input) throw new Error('no sub-habit input')
    await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText('Aquecer'); await Promise.resolve() })
    await backToSummary(tree)
    await primary(tree)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(createRequest().subHabits).toEqual(['Aquecer'])
    expect(state.push).not.toHaveBeenCalled()
    tree.unmount()
  })
})
