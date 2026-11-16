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
  completed: vi.fn(), push: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(),
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
vi.mock('@/hooks/use-create-sub-habit', () => ({ useCreateSubHabit: () => ({ mutateAsync: state.subCreate, isPending: false }) }))
vi.mock('@/hooks/use-update-habit', () => ({ useUpdateHabit: () => ({ mutateAsync: state.update, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habit-queries')>(),
  useHabitDetail: () => ({ data: state.detail ?? undefined, isPending: state.detailPending, isFetching: state.detailFetching, error: state.detailError, refetch: state.refetchDetail }),
}))
vi.mock('@/hooks/use-habits', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-habits')>(),
  useHabitDetail: () => ({ data: state.saved }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.phraseRead, isPending: false }) }))
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

function mountCreate(initialDate?: string) {
  const client = new QueryClient()
  const closed = vi.fn()
  render(<QueryClientProvider client={client}><CreateHabitModal open onOpenChange={closed} initialDate={initialDate} /></QueryClientProvider>)
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
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.subCreate.mockReset().mockResolvedValue({ id: 'child-1' })
  state.saved = { id: 'habit-9', title: 'Ligar para o João', isGeneral: false, dueDate: '2026-11-14', dueTime: '08:30', frequencyUnit: null, frequencyQuantity: null, isFlexible: false }
  state.detail = null
  state.detailPending = false
  state.detailFetching = false
  state.detailError = null
  state.refetchDetail.mockReset().mockResolvedValue(undefined)
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

  it.each([['en', 'call John every day at 8am', 'call John'], ['pt-BR', 'ligar para o João todo dia às 8', 'ligar para o João']] as const)(
    'gives a repeat phrase its start day and saves the title with no schedule words in %s', async (locale, sentence, title) => {
      state.locale = locale
      mountCreate()
      await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
      await phrase(sentence)
      expect(heading()).toHaveTextContent(messages().habits.flow.reminder.question.replace('{time}', '08:00'))
      await press(messages().habits.flow.reminder.no)
      await press(messages().habits.createHabit)
      expect(state.create).toHaveBeenCalledTimes(1)
      expect(state.create.mock.calls[0]![0]).toMatchObject({ title, startDate: '2026-11-13', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

  it('saves the title with no schedule words when the flow opens with a day', async () => {
    state.locale = 'en'
    mountCreate('2026-11-20')
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John every day at 8am')
    await press(en.habits.flow.reminder.no)
    await press(en.habits.createHabit)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'call John', startDate: '2026-11-20', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
  })

  it('keeps the words of a time the person changed in the saved title, as the full form does', async () => {
    state.locale = 'en'
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John every day at 8am')
    await press(en.habits.flow.reminder.no)
    await press(/^Time/)
    await press('14:00')
    await press(en.habits.createHabit)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'call John at 8am', startDate: '2026-11-13', dueTime: '14:00', frequencyUnit: 'Day' })
  })

  it('gives the repeat of the date question its start day', async () => {
    state.locale = 'en'
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John')
    await act(async () => { fireEvent.change(screen.getByLabelText(en.habits.flow.when.freeLabel), { target: { value: 'every day' } }) })
    await press(en.habits.flow.continue)
    await press(en.habits.flow.time.none)
    await press(en.habits.createHabit)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'call John', startDate: '2026-11-13', frequencyUnit: 'Day', frequencyQuantity: 1 })
  })

  it('keeps the time of the phrase when the repeat of the date question carries no time', async () => {
    state.locale = 'en'
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John at 8am')
    await act(async () => { fireEvent.change(screen.getByLabelText(en.habits.flow.when.freeLabel), { target: { value: 'every day' } }) })
    await press(en.habits.flow.continue)
    await press(en.habits.flow.reminder.no)
    await press(en.habits.createHabit)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'call John', startDate: '2026-11-13', dueTime: '08:00', frequencyUnit: 'Day', frequencyQuantity: 1 })
  })

  it('stops marking the time as a proposal on the summary when the date words replace the time the free read proposed', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants')
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.change(screen.getByLabelText(en.habits.flow.when.freeLabel), { target: { value: 'every day at 9am' } }) })
    await press(en.habits.flow.continue)
    await press(en.habits.flow.reminder.no)
    const timeRow = screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.time}`) })
    expect(timeRow).toHaveTextContent('09:00')
    expect(timeRow.closest('[data-proposed]')).toBeNull()
  })

  it('stops marking the repeat as a proposal on the summary when the person changes it on the repeat step', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants')
    await press(en.habits.flow.reminder.no)
    const scheduleRow = () => screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.when}`) })
    expect(scheduleRow().closest('[data-proposed]')).not.toBeNull()
    await act(async () => { fireEvent.click(scheduleRow()) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.repeat.timesIn}`) })) })
    await press(en.habits.flow.continue)
    expect(scheduleRow().closest('[data-proposed]')).toBeNull()
    expect(screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.time}`) }).closest('[data-proposed]')).not.toBeNull()
  })

  it('stops marking the repeat and the cleared time as proposals on the summary when the person makes the habit a one-time task', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants')
    await press(en.habits.flow.reminder.no)
    const scheduleRow = () => screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.when}`) })
    const timeRow = () => screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.time}`) })
    expect(scheduleRow().closest('[data-proposed]')).not.toBeNull()
    expect(timeRow()).toHaveTextContent('07:00')
    expect(timeRow().closest('[data-proposed]')).not.toBeNull()
    await press(new RegExp(`^${en.habits.flow.summary.type}`))
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${en.habits.form.typeTask}`) })) })
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    expect(scheduleRow().closest('[data-proposed]')).toBeNull()
    expect(timeRow()).toHaveTextContent(en.habits.flow.summary.noTime)
    expect(timeRow().closest('[data-proposed]')).toBeNull()
  })

  it('stops marking the time and the repeat as proposals on the summary when the person types them in the title', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants')
    await press(en.habits.flow.reminder.no)
    const scheduleRow = () => screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.when}`) })
    const timeRow = () => screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.time}`) })
    expect(timeRow()).toHaveTextContent('07:00')
    expect(timeRow().closest('[data-proposed]')).not.toBeNull()
    await press(new RegExp(`^${en.habits.flow.summary.title}`))
    await phrase('water the plants at 9am')
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    expect(timeRow()).toHaveTextContent('09:00')
    expect(timeRow().closest('[data-proposed]')).toBeNull()
    expect(scheduleRow().closest('[data-proposed]')).not.toBeNull()
    await press(new RegExp(`^${en.habits.flow.summary.title}`))
    await phrase('water the plants every monday at 9am')
    expect(scheduleRow().closest('[data-proposed]')).toBeNull()
    expect(timeRow().closest('[data-proposed]')).toBeNull()
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
  })

  it.each([['en', 'water the plants every monday at 9am', 'every Monday'], ['pt-BR', 'regar as plantas toda segunda às 9h', 'toda segunda']] as const)(
    'names the chosen weekday on the summary and in the result sentence in %s', async (locale, words, schedule) => {
      state.locale = locale
      state.saved = { id: 'habit-9', title: words, isGeneral: false, dueDate: '2026-11-13', dueTime: '09:00', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: false, days: ['Monday'], monthDays: null, intervalWeeks: 1 }
      mountCreate()
      await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
      await phrase(words)
      await press(messages().habits.flow.reminder.no)
      expect(screen.getByRole('button', { name: new RegExp(`^${messages().habits.flow.summary.when}`) })).toHaveTextContent(schedule)
      await press(messages().habits.createHabit)
      expect(state.create.mock.calls[0]![0]).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], dueTime: '09:00' })
      expect(await screen.findByRole('dialog', { name: messages().result.title })).toHaveAccessibleDescription(expect.stringContaining(`${schedule} `))
    },
  )

  it.each([
    ['an emoji', { emoji: '🪴', dueTime: null }, false],
    ['a time', { emoji: null, dueTime: '07:00' }, true],
  ] as const)('never marks a repeat the person typed as a proposal when the free read gives the same repeat and %s', async (_label, extra, timeProposed) => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [], ...extra })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants every monday')
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    if (screen.queryByRole('button', { name: en.habits.flow.time.none })) await press(en.habits.flow.time.none)
    if (screen.queryByRole('button', { name: en.habits.flow.reminder.no })) await press(en.habits.flow.reminder.no)
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    const scheduleRow = screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.when}`) })
    expect(scheduleRow).toHaveTextContent('every Monday')
    expect(scheduleRow.closest('[data-proposed]')).toBeNull()
    expect(screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.time}`) }).closest('[data-proposed]') !== null).toBe(timeProposed)
  })

  it('marks a repeat the person typed as a proposal when the free read replaces it', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, subHabits: [], checklistItems: [], emoji: '🪴', dueTime: null })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants every monday')
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    if (screen.queryByRole('button', { name: en.habits.flow.time.none })) await press(en.habits.flow.time.none)
    if (screen.queryByRole('button', { name: en.habits.flow.reminder.no })) await press(en.habits.flow.reminder.no)
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    const scheduleRow = screen.getByRole('button', { name: new RegExp(`^${en.habits.flow.summary.when}`) })
    expect(scheduleRow).toHaveTextContent('every day')
    expect(scheduleRow.closest('[data-proposed]')).not.toBeNull()
  })

  it('keeps a child of a General parent undated when the free read proposes a repeat and a time, and marks only the emoji', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: true, emoji: '🪴', frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const parent = createMockHabit({ id: 'parent-1', title: 'Home', isGeneral: true, frequencyUnit: null, frequencyQuantity: null, dueTime: null })
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={vi.fn()} parentHabit={parent} /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('water the plants')
    expect(state.phraseRead).toHaveBeenCalledTimes(1)
    if (screen.queryByRole('button', { name: en.habits.flow.time.none })) await press(en.habits.flow.time.none)
    if (screen.queryByRole('button', { name: en.habits.flow.reminder.no })) await press(en.habits.flow.reminder.no)
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    expect(screen.getByText(en.habits.flow.summary.when)).toBeInTheDocument()
    expect([...document.querySelectorAll('[data-proposed]')].map((node) => node.textContent)).toEqual(['🪴'])
    await press(en.common.create)
    expect(state.subCreate).toHaveBeenCalledTimes(1)
    const sent = (state.subCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data
    expect(sent).toMatchObject({ title: 'water the plants', emoji: '🪴' })
    expect(sent).not.toHaveProperty('frequencyUnit')
    expect(sent).not.toHaveProperty('dueTime')
    expect(sent).not.toHaveProperty('dueDate')
  })

  it('reads a repeat typed in the phrase after the person makes a task a habit on the type step', async () => {
    state.locale = 'en'
    state.phraseRead.mockResolvedValue({ read: false, emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John')
    await press(en.habits.flow.when.tomorrow)
    await press('08:00')
    await press(en.habits.flow.reminder.no)
    await press(new RegExp(`^${en.habits.flow.summary.type}`))
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${en.habits.form.typeHabit}`) })) })
    await press(new RegExp(`^${en.habits.flow.summary.title}`))
    await act(async () => { fireEvent.change(screen.getByLabelText(en.habits.flow.what.label), { target: { value: 'call John every monday' } }) })
    await press(en.habits.flow.continue)
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    await press(en.habits.createHabit)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.create.mock.calls[0]![0]).toMatchObject({ title: 'call John', startDate: '2026-11-14', frequencyUnit: 'Day', days: ['Monday'], dueTime: '08:00' })
  })

  it('states a refused save on the summary and sends nothing, when an undated task becomes a habit with no start day', async () => {
    state.locale = 'en'
    mountCreate()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await phrase('call John')
    await press(en.habits.flow.when.noDate)
    await press(new RegExp(`^${en.habits.flow.summary.type}`))
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${en.habits.form.typeHabit}`) })) })
    await press(en.habits.createHabit)
    expect(state.create).not.toHaveBeenCalled()
    expect(heading()).toHaveTextContent(en.habits.flow.confirm.question)
    expect(screen.getByRole('alert')).toHaveTextContent(en.habits.form.dateStale)
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

  const summary = () => screen.getByRole('group', { name: ptBR.habits.flow.confirm.question })
  const save = () => screen.getByRole('button', { name: ptBR.common.save })

  it('shows a skeleton for each summary row while the stored details load, with no spinner and the save waiting on its label', async () => {
    state.detailPending = true
    state.detailFetching = true
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    const skeleton = summary().querySelector('[data-summary-skeleton]')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(skeleton).toHaveAccessibleName(ptBR.common.loading)
    expect(skeleton!.querySelectorAll('[data-variant="fill"]').length).toBeGreaterThan(1)
    expect(screen.queryByRole('button', { name: /^Hora/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ptBR.habits.flow.more })).not.toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).toBeNull()
    expect(save()).toBeEnabled()
    expect(save()).toHaveAttribute('aria-busy', 'true')
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    expect(save()).toHaveAttribute('data-loading')
    expect(save()).toHaveTextContent(ptBR.common.save)
    await act(async () => { save().click() })
    expect(state.update).not.toHaveBeenCalled()
  })

  it('states a failed detail read on the summary with a retry, keeps the save off and sends nothing', async () => {
    state.detailError = new Error('offline')
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    expect(summary().querySelector('[data-summary-skeleton]')).toBeNull()
    expect(screen.getByRole('alert')).not.toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /^Hora/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ptBR.habits.flow.more })).not.toBeInTheDocument()
    expect(save()).toBeDisabled()
    await act(async () => { save().click() })
    expect(state.update).not.toHaveBeenCalled()
    await press(ptBR.common.retry)
    expect(state.refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('shows the skeleton again while the retry of a failed detail read runs', async () => {
    state.detailError = new Error('offline')
    state.detailFetching = true
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    expect(summary().querySelector('[data-summary-skeleton]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(save()).toBeEnabled()
    expect(save()).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the stored values and an enabled save once the details load', async () => {
    state.detail = { ...storedHabit, parentId: null, children: [], endDate: null }
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question))
    expect(summary().querySelector('[data-summary-skeleton]')).toBeNull()
    expect(screen.getByRole('button', { name: /^Hora/ })).toHaveTextContent('07:00')
    expect(save()).toBeEnabled()
  })
})
