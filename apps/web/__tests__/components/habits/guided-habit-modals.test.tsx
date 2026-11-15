import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'

const state = vi.hoisted(() => ({
  locale: 'pt-BR' as 'en' | 'pt-BR', flag: true, online: true, clock24: true,
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, detail: null as Record<string, unknown> | null,
  completed: vi.fn(), push: vi.fn(),
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push, replace: vi.fn(), back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => state.flag }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: state.clock24, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: true } }),
  useHasProAccess: () => true,
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-create-habit', () => ({ useCreateHabit: () => ({ mutateAsync: state.create, isPending: false }) }))
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: () => ({ data: state.detail, isPending: false, error: null, refetch: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/hooks/use-habits', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habits')>(),
  useHabitDetail: () => ({ data: state.saved }),
}))
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
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: state.completed }))

const messages = () => (state.locale === 'en' ? en : ptBR)
const heading = () => screen.getByRole('heading', { level: 1 })
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function phrase(text: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(messages().habits.flow.what.label), { target: { value: text } }) })
  await press(messages().habits.flow.continue)
}

function mountCreate() {
  const client = new QueryClient()
  const closed = vi.fn()
  render(<QueryClientProvider client={client}><CreateHabitModal open onOpenChange={closed} /></QueryClientProvider>)
  return { closed }
}

const storedHabit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00', reminderEnabled: false })

function mountEdit() {
  const client = new QueryClient()
  const closed = vi.fn()
  render(<QueryClientProvider client={client}><EditHabitModal open onOpenChange={closed} habit={storedHabit} /></QueryClientProvider>)
  return { closed }
}

beforeEach(() => {
  state.flag = true
  state.online = true
  state.clock24 = true
  state.locale = 'pt-BR'
  state.create.mockReset().mockResolvedValue({ id: 'habit-9' })
  state.update.mockReset().mockResolvedValue({})
  state.completed.mockReset()
  state.saved = { id: 'habit-9', title: 'Ligar para o João', isGeneral: false, dueDate: '2026-11-14', dueTime: '08:30', frequencyUnit: null, frequencyQuantity: null, isFlexible: false }
  state.detail = null
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the create surface behind orbit_guided_flows', () => {
  it('renders the current form with the flag off', async () => {
    state.flag = false
    mountCreate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(document.querySelector('[data-question-flow]')).toBeNull()
    expect(screen.getByRole('button', { name: /habits?\.create|Criar/ })).toBeInTheDocument()
  })

  it('renders the one-question flow in the flow host with the flag on', async () => {
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-flow-screen] [data-question-flow]')).not.toBeNull())
    expect(heading()).toHaveTextContent(ptBR.habits.flow.what.question)
  })

  it('renders the flow in the route host on the create route, where the shell and the sidebar stay', async () => {
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open presentation="screen" onOpenChange={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-flow-screen][data-presentation="route"] [data-question-flow]')).not.toBeNull())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['pt-BR', 'en'] as const)('creates once on a double press and opens the result dialog from the saved record in %s', async (locale) => {
    state.locale = locale
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
    await press(messages().habits.flow.when.tomorrow)
    await press('08:00')
    await press(messages().habits.flow.reminder.yes)
    const create = screen.getByRole('button', { name: messages().habits.createTask })
    await act(async () => { create.click(); create.click() })
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.create.mock.calls[0]![0]).toEqual({
      title: locale === 'en' ? 'call John' : 'ligar para o João', isBadHabit: false, dueDate: '2026-11-14', dueTime: '08:00',
      reminderEnabled: true, reminderTimes: [], relativeReminders: [{ minutesBefore: 0 }, { minutesBefore: 15 }],
    })
    expect(state.completed).toHaveBeenCalledWith('habit_create', 5, false)
    const dialog = await screen.findByRole('dialog', { name: messages().result.title })
    expect(dialog).toHaveAccessibleDescription(messages().result.task.datedTimed.replace('{date}', expect.any(String) as unknown as string).split('{')[0]!.trim() ? expect.stringContaining('08:30') : '')
    await waitFor(() => expect(screen.getByRole('button', { name: messages().result.seeCalendar })).toHaveFocus())
    expect(document.querySelector('[data-orbit-state="feliz"]')).not.toBeNull()
  })

  it('names the time of the saved record in the clock of the person', async () => {
    state.clock24 = false
    state.locale = 'en'
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John')
    await press(en.habits.flow.when.tomorrow)
    await press('8:00 AM')
    await press(en.habits.flow.reminder.no)
    await press(en.habits.createTask)
    expect(await screen.findByRole('dialog', { name: en.result.title })).toHaveAccessibleDescription(expect.stringContaining('8:30 AM'))
  })

  it('keeps the summary open with the server message after a failed save, with no result dialog', async () => {
    state.create.mockRejectedValue(Object.assign(new Error('Servidor indisponível'), { status: 500 }))
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('arrumar a garagem')
    await press(ptBR.habits.flow.when.noDate)
    await press(ptBR.habits.createTask)
    expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question)
    expect(screen.getByRole('alert')).not.toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog', { name: ptBR.result.title })).not.toBeInTheDocument()
  })

  it('shows the current offline refusal on the summary and sends nothing offline', async () => {
    state.online = false
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('arrumar a garagem')
    await press(ptBR.habits.flow.when.noDate)
    expect(screen.getByText(ptBR.offline.create.title)).toBeInTheDocument()
    await press(ptBR.habits.createTask)
    expect(state.create).not.toHaveBeenCalled()
  })
})

describe('the edit surface behind orbit_guided_flows', () => {
  it('renders the current form with the flag off', async () => {
    state.flag = false
    mountEdit()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(document.querySelector('[data-question-flow]')).toBeNull()
    expect(screen.getByRole('button', { name: ptBR.common.save })).toBeInTheDocument()
  })

  it('opens on the summary with the stored values and closes an unchanged edit with no discard question', async () => {
    const { closed } = mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    expect(screen.getByRole('button', { name: /^Hora/ })).toHaveTextContent('07:00')
    await press(ptBR.habits.flow.close)
    expect(screen.queryByText(ptBR.common.discardChangesTitle)).not.toBeInTheDocument()
    expect(closed).toHaveBeenCalledWith(false)
  })

  it('saves the time change only and closes with the result dialog for the change', async () => {
    state.saved = { ...storedHabit, dueTime: '20:00' }
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    await press(/^Hora/)
    await press('20:00')
    await press(ptBR.common.save)
    expect(state.update).toHaveBeenCalledTimes(1)
    const { habitId, data } = state.update.mock.calls[0]![0] as { habitId: string; data: Record<string, unknown> }
    expect(habitId).toBe('habit-1')
    expect(data).toMatchObject({ title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '20:00' })
    expect(state.completed).toHaveBeenCalledWith('habit_edit', 1, false)
    expect(await screen.findByRole('dialog', { name: ptBR.result.title })).toHaveAccessibleDescription(ptBR.result.habit.updated)
  })
})
