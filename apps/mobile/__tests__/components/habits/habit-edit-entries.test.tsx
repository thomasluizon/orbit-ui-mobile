import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitDetail } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { TodayModals } from '@/components/today/today-modals'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  detail: null as HabitDetail | null,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true }),
  useIsFocused: () => true, useLocalSearchParams: () => ({}), usePathname: () => '/',
}))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: vi.fn() }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark', surfaces: { screen: { backgroundColor: '#0a0a0a' } }, radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 999 }, shadows: {}, applyScheme: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile, isError: false, refetch: vi.fn() }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => {
  const { normalizeHabitQueryData: normalize } = await import('@orbit/shared/utils')
  const data = normalize([])
  return {
    ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
    useHabits: () => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
    useHabitDetail: () => ({ data: state.detail, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn().mockResolvedValue({ isSuccess: true }) }),
    useHabitLogs: () => ({ data: [] }),
    useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  }
})
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-delete-habit', () => ({ useDeleteHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-update-checklist', () => ({ useUpdateChecklist: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-correct-habit-dose', () => ({ useCorrectHabitDose: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }) }))
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
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

type Tree = ReturnType<typeof renderNavigation>
const named = (node: ReturnType<Tree['hosts']>[number], name: string) => node.props.accessibilityLabel === name || node.findAll((child) => child.props.children === name).length > 0
const control = (tree: Tree, name: string) => tree.hosts().find((node) => typeof node.props.onPress === 'function' && named(node, name))
const hasTestId = (tree: Tree, testID: string) => tree.hosts().some((node) => node.props.testID === testID)
const heading = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
async function tap(tree: Tree, name: string) {
  const target = control(tree, name)
  if (!target) throw new Error(`no control named ${name}`)
  await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
}

const mountDetail = () => renderNavigation(<QueryClientProvider client={new QueryClient()}><HabitDetailScreen habitId="habit-1" /></QueryClientProvider>)
const todayModals = (editHabit: ReturnType<typeof createMockHabit> | null) => (
  <QueryClientProvider client={new QueryClient()}>
    <TodayModals showCreateModal={false} onCloseCreateModal={vi.fn()} createInitialDate={null} editHabit={editHabit} editHabitParentIsGeneral={null}
      onCloseEdit={vi.fn()} editHabitOnSaved={null} showBulkDeleteConfirm={false} onBulkDeleteOpenChange={vi.fn()} onConfirmBulkDelete={vi.fn()}
      selectedCount={0} showReferral={false} onCloseReferral={vi.fn()} />
  </QueryClientProvider>
)

beforeEach(() => {
  state.profile = createMockProfile({ timeZone: 'UTC', hasProAccess: true })
  state.detail = { ...makeHabitDetail(), title: 'Correr', linkedGoals: [], slipAlertEnabled: false, tags: [] }
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers() })

describe.each(['pt-BR', 'en'] as const)('every Android edit entry of Hoje and habit detail opens the guided flow in %s', (locale) => {
  const messages = locale === 'en' ? en : ptBR
  beforeEach(async () => { await i18n.changeLanguage(locale) })

  it('opens the guided edit flow on its summary from the Hoje edit host the row menu fills', async () => {
    enableTestFlags('orbit_guided_flows')
    const habit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const tree = renderNavigation(todayModals(null))
    expect(hasTestId(tree, 'question-flow')).toBe(false)
    tree.update(todayModals(habit))
    await settle()
    expect(hasTestId(tree, 'flow-screen')).toBe(true)
    expect(heading(tree)).toContain(messages.habits.flow.confirm.question)
    tree.unmount()
  })

  it('opens the guided edit flow on its summary from the pencil of habit detail', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = mountDetail()
    await settle()
    await tap(tree, messages.habits.editHabit)
    await settle()
    expect(hasTestId(tree, 'question-flow')).toBe(true)
    expect(heading(tree)).toContain(messages.habits.flow.confirm.question)
    tree.unmount()
  })

  it('opens the guided create flow from Add sub-habit on habit detail', async () => {
    enableTestFlags('orbit_guided_flows')
    const tree = mountDetail()
    await settle()
    await tap(tree, messages.habits.detail.addSubHabit)
    await settle()
    expect(hasTestId(tree, 'question-flow')).toBe(true)
    expect(heading(tree)).toContain(messages.habits.flow.what.question)
    tree.unmount()
  })
})

describe('the Android edit entries with orbit_guided_flows off', () => {
  it('keep the current edit form from the Hoje edit host and the pencil', async () => {
    await i18n.changeLanguage('pt-BR')
    const habit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const list = renderNavigation(todayModals(habit))
    await settle()
    expect(hasTestId(list, 'question-flow')).toBe(false)
    list.unmount()
    const detail = mountDetail()
    await settle()
    await tap(detail, ptBR.habits.editHabit)
    await settle()
    expect(hasTestId(detail, 'question-flow')).toBe(false)
    detail.unmount()
  })
})

