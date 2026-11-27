import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createMockGoal } from '@orbit/shared/__tests__/factories'

const inventory = vi.hoisted(() => ({ read: vi.fn() }))
const state = vi.hoisted(() => ({
  locale: 'pt-BR' as 'en' | 'pt-BR', online: true, clock24: true,
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, detail: null as Record<string, unknown> | null,
  completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(), showError: vi.fn(), pro: true,
}))

function lookup(messages: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
  return typeof value === 'string' ? value : key
}

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    lookup(state.locale === 'en' ? en : ptBR, key).replaceAll(/\{(\w+)\}/g, (_match, name: string) => `${values?.[name] ?? ''}`),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push, replace: state.replace, back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: state.clock24, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: state.pro } }),
  useHasProAccess: () => state.pro,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: state.showError, showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: state.subCreate, isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: () => ({ data: state.detail ?? undefined, isPending: state.detailPending, isFetching: state.detailFetching, error: state.detailError, refetch: state.refetchDetail, retry: state.refetchDetail }),
}))
vi.mock('@/hooks/use-habits', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habits')>(),
  useHabitDetail: () => ({ data: state.saved }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.phraseRead, isPending: false }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, requestPermission: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [{ id: 'tag-1', name: 'Saúde', color: '#7c3aed' }] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
vi.mock('@/lib/api-fetch', () => ({ fetchJson: inventory.read }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: state.completed }))


const flow = ptBR.habits.flow
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
const heading = () => screen.getByRole('heading', { level: 1 })
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function mountCreate() {
  render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={vi.fn()} /></QueryClientProvider>)
}
async function toSummary() {
  await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
  await act(async () => { fireEvent.change(screen.getByLabelText(flow.what.label), { target: { value: 'ler todo dia às 8' } }) })
  await press(flow.continue)
  await press(flow.reminder.no)
  expect(heading()).toHaveTextContent(flow.confirm.question)
}
async function openOptional(question: string) {
  await press(flow.more)
  await press(new RegExp(escapeRegExp(question)))
  expect(heading()).toHaveTextContent(question)
}
async function backToSummary() {
  for (let guard = 0; guard < 3 && !heading().textContent.includes(flow.confirm.question); guard += 1) await press(flow.continue)
  expect(heading()).toHaveTextContent(flow.confirm.question)
}
const createRequest = () => state.create.mock.calls[0]![0] as Record<string, unknown>

beforeEach(() => {
  state.locale = 'pt-BR'
  state.pro = true
  state.create.mockReset().mockResolvedValue({ id: 'habit-9' })
  state.completed.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.saved = { id: 'habit-9', title: 'ler', isGeneral: false, dueDate: '2026-11-13', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: false }
  inventory.read.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the create request of the guided create', () => {
  it('sends the goal linked on the goal step in the one create request', async () => {
    mountCreate()
    await toSummary()
    await openOptional(flow.optional.goals)
    await press('Ler 12 livros, 10%')
    await backToSummary()
    await press(ptBR.habits.createHabit)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(createRequest().goalIds).toEqual(['goal-2'])
  })

  it('sends the sub-habit typed on the sub-habit step in the one create request, on a Free plan with no gate', async () => {
    state.pro = false
    mountCreate()
    await toSummary()
    await openOptional(flow.optional.subHabits)
    await press(ptBR.habits.form.addSubHabit)
    await act(async () => { fireEvent.change(screen.getByLabelText(ptBR.habits.form.subHabitInputLabel.replace('{index}', '1')), { target: { value: 'Aquecer' } }) })
    await backToSummary()
    await press(ptBR.habits.createHabit)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(createRequest().subHabits).toEqual(['Aquecer'])
    expect(state.push).not.toHaveBeenCalled()
  })
})
