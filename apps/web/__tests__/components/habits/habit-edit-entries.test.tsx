import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitDetail } from '@orbit/shared/types/habit'
import { formatAPIDate, normalizeHabitQueryData } from '@orbit/shared/utils'
import { HabitList } from '@/components/habits/habit-list'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

const state = vi.hoisted(() => ({
  online: true,
  profile: null as Record<string, unknown> | null,
  detail: null as HabitDetail | null,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({}),
  useRouter: () => state.router, useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => formatAPIDate(new Date()) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: state.profile }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false, useIsDesktop: () => false }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: vi.fn(), showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => {
  const { normalizeHabitQueryData: normalize } = await import('@orbit/shared/utils')
  const { createMockHabitScheduleItem: item } = await import('@orbit/shared/__tests__/factories')
  const data = normalize([item({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', scheduledDates: ['2026-11-13'] })])
  return {
    ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
    useHabits: () => ({ data, isLoading: false, isError: false, error: null, dataUpdatedAt: 1, refetch: vi.fn(), getChildren: () => [] }),
    useHabitCountLoaded: () => ({ count: 1, isLoaded: true }),
    useHabitDetail: () => ({ data: state.detail, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn().mockResolvedValue(undefined) }),
    useHabitLogs: () => ({ data: [] }),
    useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  }
})
vi.mock('@/hooks/use-habit-logging', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-logging')>(),
  useLogHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSkipHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-delete-habit', () => ({ useDeleteHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-duplicate-habit', () => ({ useDuplicateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-reorder-habits', () => ({ useReorderHabits: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-move-habit-parent', () => ({ useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
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
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null, useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

type Locale = 'en' | 'pt-BR'
const messagesOf = (locale: Locale) => (locale === 'en' ? en : ptBR)

function mount(children: ReactNode, locale: Locale) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<NextIntlClientProvider locale={locale} messages={messagesOf(locale)} timeZone="UTC"><QueryClientProvider client={client}>{children}</QueryClientProvider></NextIntlClientProvider>)
}

const flow = () => document.querySelector('[data-flow-screen] [data-question-flow]')
const question = () => screen.getByRole('heading', { level: 1 })

async function openRowMenuItem(locale: Locale, item: string) {
  const user = userEvent.setup()
  const row = screen.getAllByTestId('habit-row')[0]!
  await user.click(within(row).getByRole('button', { name: messagesOf(locale).habits.actions.more }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
  await act(async () => { await vi.dynamicImportSettled() })
}

beforeEach(() => {
  state.online = true
  state.profile = createMockProfile({ timeZone: 'UTC', hasProAccess: true })
  state.detail = { ...makeHabitDetail(), title: 'Correr', linkedGoals: [], slipAlertEnabled: false, tags: [] } as HabitDetail
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each(['pt-BR', 'en'] as const)('every edit entry of Hoje and habit detail opens the guided flow in %s', (locale) => {
  const messages = messagesOf(locale)

  it('opens the guided edit flow on its summary from the Edit item of the row menu', async () => {
    enableTestFlags('orbit_guided_flows')
    mount(<HabitList view="today" filters={{}} />, locale)
    await openRowMenuItem(locale, messages.common.edit)
    await waitFor(() => expect(flow()).not.toBeNull())
    expect(question()).toHaveTextContent(messages.habits.flow.confirm.question)
  })

  it('opens the guided create flow from the Add sub-habit item of the row menu', async () => {
    enableTestFlags('orbit_guided_flows')
    mount(<HabitList view="today" filters={{}} />, locale)
    await openRowMenuItem(locale, messages.habits.actions.addSubHabit)
    await waitFor(() => expect(flow()).not.toBeNull())
    expect(question()).toHaveTextContent(messages.habits.flow.what.question)
  })

  it('opens the guided edit flow on its summary from the pencil of habit detail', async () => {
    enableTestFlags('orbit_guided_flows')
    mount(<HabitDetailScreen habitId="habit-1" />, locale)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.habits.editHabit })) })
    await waitFor(() => expect(flow()).not.toBeNull())
    expect(question()).toHaveTextContent(messages.habits.flow.confirm.question)
  })

  it('opens the guided create flow from Add sub-habit on habit detail', async () => {
    enableTestFlags('orbit_guided_flows')
    mount(<HabitDetailScreen habitId="habit-1" />, locale)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.habits.detail.addSubHabit })) })
    await waitFor(() => expect(flow()).not.toBeNull())
    expect(question()).toHaveTextContent(messages.habits.flow.what.question)
  })
})

describe('the edit entries with orbit_guided_flows off', () => {
  it('keep the current edit form from the row menu and the pencil', async () => {
    const list = mount(<HabitList view="today" filters={{}} />, 'pt-BR')
    await openRowMenuItem('pt-BR', ptBR.common.edit)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(flow()).toBeNull()
    expect(screen.getByRole('button', { name: ptBR.common.save })).toBeInTheDocument()
    list.unmount()
    mount(<HabitDetailScreen habitId="habit-1" />, 'pt-BR')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ptBR.habits.editHabit })) })
    await waitFor(() => expect(screen.getByRole('button', { name: ptBR.common.save })).toBeInTheDocument())
    expect(flow()).toBeNull()
  })
})
