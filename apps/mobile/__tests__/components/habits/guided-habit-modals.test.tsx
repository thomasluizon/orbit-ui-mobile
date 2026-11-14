import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({
  flag: true, create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, completed: vi.fn(), push: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push, replace: vi.fn(), back: vi.fn(), canGoBack: () => true }), useIsFocused: () => true, useLocalSearchParams: () => ({}) }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.flag }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: true } }),
  useHasProAccess: () => true,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: (id: string | null) => ({ data: id ? state.saved : undefined, isPending: false, error: null, refetch: vi.fn().mockResolvedValue({ isSuccess: false }) }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, requestPermission: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
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
async function phrase(tree: Tree, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === ptBR.habits.flow.what.label)!
  await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
  await primary(tree)
}

const storedHabit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00', reminderEnabled: false })

function mountCreate() {
  return renderNavigation(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onClose={vi.fn()} /></QueryClientProvider>)
}
function mountEdit(onClose = vi.fn()) {
  return renderNavigation(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onClose={onClose} habit={storedHabit} /></QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.flag = true
  state.create.mockReset()
  state.update.mockReset().mockResolvedValue({})
  state.completed.mockReset()
  state.saved = null
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe('the Android create surface behind orbit_guided_flows', () => {
  it('renders the current form with the flag off', async () => {
    state.flag = false
    const tree = mountCreate()
    await settle()
    expect(hasTestId(tree, 'question-flow')).toBe(false)
    tree.unmount()
  })

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
    expect(tree.hosts().some((node) => typeof node.props.children === 'string' && node.props.children.includes('08:00') && node.props.children.startsWith('A tarefa foi criada para'))).toBe(true)
    tree.unmount()
  })
})

describe('the Android edit surface behind orbit_guided_flows', () => {
  it('renders the current form with the flag off', async () => {
    state.flag = false
    const tree = mountEdit()
    await settle()
    expect(hasTestId(tree, 'question-flow')).toBe(false)
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
    tree.unmount()
  })
})
