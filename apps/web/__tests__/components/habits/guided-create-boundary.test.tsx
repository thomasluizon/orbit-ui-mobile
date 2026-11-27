import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createApiClientError } from '@orbit/shared/utils'
import { habitSuggestionDraftFixture } from '@orbit/shared/test-support/chat-fixtures'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const state = vi.hoisted(() => ({
  locale: 'pt-BR' as 'en' | 'pt-BR', online: true, clock24: true,
  create: vi.fn(), update: vi.fn(), saved: null as Record<string, unknown> | null, detail: null as Record<string, unknown> | null,
  completed: vi.fn(), push: vi.fn(), replace: vi.fn(), phraseRead: vi.fn(), subCreate: vi.fn(),
  detailPending: false, detailFetching: false, detailError: null as Error | null, refetchDetail: vi.fn(), showError: vi.fn(),
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
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: state.clock24, weekStartDay: 0, aiMessagesUsed: 0, aiMessagesLimit: 5, hasProAccess: true } }),
  useHasProAccess: () => true,
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
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null, useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: state.completed }))

const messages = () => (state.locale === 'en' ? en : ptBR)
const heading = () => screen.getByRole('heading', { level: 1 })
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function phrase(text: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(messages().habits.flow.what.label), { target: { value: text } }) })
  await press(messages().habits.flow.continue)
}
const limitError = (errorCode: 'HABIT_LIMIT_REACHED' | 'PAY_GATE') => createApiClientError(errorCode === 'PAY_GATE' ? 403 : 400, { error: 'Boundary', errorCode }, 'Boundary')

async function reachSummary(locale: 'pt-BR' | 'en') {
  await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
  await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
  await press(messages().habits.flow.when.tomorrow)
  await press('08:00')
  await press(messages().habits.flow.reminder.no)
}

beforeEach(() => {
  state.online = true
  state.locale = 'pt-BR'
  state.create.mockReset()
  state.completed.mockReset()
  state.push.mockReset()
  state.showError.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.saved = { id: 'habit-9', title: 'Ligar para o João', isGeneral: false, dueDate: '2026-11-14', dueTime: '08:00', frequencyUnit: null, frequencyQuantity: null, isFlexible: false }
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the create boundary of the guided create', () => {
  it.each(['HABIT_LIMIT_REACHED', 'PAY_GATE'] as const)('shows the inline %s notice on the summary with no toast and no close, and a retry saves', async (errorCode) => {
    state.create.mockRejectedValueOnce(limitError(errorCode)).mockResolvedValueOnce({ id: 'habit-9' })
    const closed = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={closed} /></QueryClientProvider>)
    await reachSummary('pt-BR')
    await press(ptBR.habits.createTask)
    expect(state.create).toHaveBeenCalledTimes(1)
    const notice = document.querySelector<HTMLElement>('[data-capacity-notice]')!
    expect(notice).not.toBeNull()
    expect(within(notice).getByText(errorCode === 'PAY_GATE' ? ptBR.habits.form.proRequired : ptBR.habits.form.capacityTitle)).toBeInTheDocument()
    expect(within(notice).queryByRole('button', { name: ptBR.common.upgrade }) !== null).toBe(errorCode === 'PAY_GATE')
    expect(state.showError).not.toHaveBeenCalled()
    expect(state.completed).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalledWith(false)
    expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question)
    expect(screen.getByRole('button', { name: ptBR.habits.createTask })).not.toBeDisabled()
    await press(ptBR.habits.createTask)
    expect(state.create).toHaveBeenCalledTimes(2)
    expect(state.completed).toHaveBeenCalledWith('habit_create', 5, false)
  })
})

describe('the dismissal guard of the guided create', () => {
  const mount = (onOpenChange = vi.fn()) => {
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={onOpenChange} /></QueryClientProvider>)
    return onOpenChange
  }
  async function reachPayGate(onOpenChange: ReturnType<typeof vi.fn>) {
    state.create.mockRejectedValueOnce(limitError('PAY_GATE'))
    await reachSummary('pt-BR')
    await press(ptBR.habits.createTask)
    expect(onOpenChange).not.toHaveBeenCalled()
  }

  it('opens Upgrade only after the person discards the dirty flow', async () => {
    const onOpenChange = mount()
    await reachPayGate(onOpenChange)
    await press(ptBR.common.upgrade)
    expect(screen.getByRole('button', { name: ptBR.common.keepEditing })).toBeInTheDocument()
    expect(state.push).not.toHaveBeenCalled()
    await press(ptBR.common.discardChangesAction)
    await waitFor(() => expect(state.push).toHaveBeenCalledExactlyOnceWith('/upgrade'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('forgets the queued Upgrade when the person keeps editing, so a later discard only closes', async () => {
    const onOpenChange = mount()
    await reachPayGate(onOpenChange)
    await press(ptBR.common.upgrade)
    await press(ptBR.common.keepEditing)
    await waitFor(() => expect(screen.queryByRole('button', { name: ptBR.common.keepEditing })).toBeNull())
    expect(state.push).not.toHaveBeenCalled()
    await press(ptBR.habits.flow.close)
    await press(ptBR.common.discardChangesAction)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(state.push).not.toHaveBeenCalled()
  })

  it('closes without asking when the flow is still clean', async () => {
    const onOpenChange = mount()
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    await press(ptBR.habits.flow.close)
    expect(screen.queryByRole('button', { name: ptBR.common.keepEditing })).toBeNull()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('the account scope of the guided create', () => {
  it('closes the flow of the previous account and commits no frame of it', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    const committedOpen: boolean[] = []
    let generation = -1
    function Host() {
      const [open, setOpen] = React.useState(true)
      React.useLayoutEffect(() => { committedOpen.push(open && document.querySelector('[data-question-flow]') !== null) })
      generation += 1
      return <CreateHabitModal open={open} onOpenChange={setOpen} />
    }
    render(<QueryClientProvider client={new QueryClient()}><Host /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    committedOpen.length = 0
    await replaceAccountWith('user-2')
    expect(document.querySelector('[data-question-flow]')).toBeNull()
    expect(committedOpen).not.toContain(true)
  })

  it('opens for the new account after an account change while closed', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    function Host() {
      const [open, setOpen] = React.useState(false)
      return <>
        <button type="button" onClick={() => setOpen(true)}>open under B</button>
        <CreateHabitModal open={open} onOpenChange={setOpen} />
      </>
    }
    render(<QueryClientProvider client={new QueryClient()}><Host /></QueryClientProvider>)
    await replaceAccountWith('user-2')
    await press('open under B')
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
  })

  it('does not close the next account flow when an old create finishes', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    let releaseCreate!: (value: object) => void
    state.create.mockImplementationOnce(() => new Promise((resolve) => { releaseCreate = resolve }))
    const onOpenChange = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={onOpenChange} /></QueryClientProvider>)
    await reachSummary('pt-BR')
    await press(ptBR.habits.createTask)
    expect(state.create).toHaveBeenCalledTimes(1)
    await replaceAccountWith('user-2')
    onOpenChange.mockClear()
    await act(async () => { releaseCreate({ id: 'habit-9' }); await Promise.resolve() })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(state.completed).not.toHaveBeenCalled()
  })
})

describe('the suggestion prefill of the guided create', () => {
  it('opens the flow with the title and the day of the suggestion already answered', async () => {
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open initialSuggestion={habitSuggestionDraftFixture} onOpenChange={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    expect(screen.getByLabelText(ptBR.habits.flow.what.label)).toHaveValue('Read')
    await press(ptBR.habits.flow.continue)
    expect(heading()).toHaveTextContent(ptBR.habits.flow.when.question)
    expect(screen.getByText('26/10/2026')).toBeInTheDocument()
  })

  it('opens an empty flow when no suggestion comes with it', async () => {
    render(<QueryClientProvider client={new QueryClient()}><CreateHabitModal open onOpenChange={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('[data-question-flow]')).not.toBeNull())
    expect(screen.getByLabelText(ptBR.habits.flow.what.label)).toHaveValue('')
  })
})
