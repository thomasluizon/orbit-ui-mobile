import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { createMockGoal, createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'

const inventory = vi.hoisted(() => ({ read: vi.fn() }))
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
const storedHabit = createMockHabit({ id: 'habit-1', title: 'Correr', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00', reminderEnabled: false, tags: [], linkedGoals: [] })

function mountEdit(props: Partial<React.ComponentProps<typeof EditHabitModal>> = {}) {
  const client = new QueryClient()
  const view = render(<QueryClientProvider client={client}><EditHabitModal open onOpenChange={vi.fn()} habit={storedHabit} {...props} /></QueryClientProvider>)
  return { rerender: (next: Partial<React.ComponentProps<typeof EditHabitModal>>) => view.rerender(<QueryClientProvider client={client}><EditHabitModal open onOpenChange={vi.fn()} habit={storedHabit} {...props} {...next} /></QueryClientProvider>) }
}
async function openOptional(question: string) {
  await press(flow.more)
  await press(new RegExp(escapeRegExp(question)))
  expect(heading()).toHaveTextContent(question)
}

beforeEach(() => {
  state.locale = 'pt-BR'
  state.update.mockReset().mockResolvedValue({})
  state.completed.mockReset()
  state.phraseRead.mockReset().mockResolvedValue(null)
  state.detail = null
  state.detailPending = false
  state.detailFetching = false
  state.detailError = null
  inventory.read.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const updateData = () => (state.update.mock.calls[0]![0] as { habitId: string; data: Record<string, unknown> }).data
async function toSummaryAfter(question: string, choose: () => Promise<void>) {
  await waitFor(() => expect(heading()).toHaveTextContent(flow.confirm.question))
  await openOptional(question)
  await choose()
  await press(flow.continue)
  await press(flow.continue)
  expect(heading()).toHaveTextContent(flow.confirm.question)
}
async function saveTime() {
  await press(/^Hora/)
  await press('20:00')
  await press(ptBR.common.save)
}

describe('the edit save payload of the guided edit', () => {
  it('sends the tag chosen on the tag step in the one update', async () => {
    mountEdit()
    await toSummaryAfter(flow.optional.tags, () => press('Saúde'))
    await press(ptBR.common.save)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().tagIds).toEqual(['tag-1'])
  })

  it('sends the goal chosen on the goal step in the one update', async () => {
    mountEdit()
    await toSummaryAfter(flow.optional.goals, () => press('Ler 12 livros, 10%'))
    await press(ptBR.common.save)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().goalIds).toEqual(['goal-2'])
  })

  it('sends the stored tags and goals untouched when only the time changes', async () => {
    mountEdit({ habit: createMockHabit({ ...storedHabit, tags: [{ id: 'tag-1', name: 'Saúde', color: '#7c3aed' }], linkedGoals: [{ id: 'goal-1', title: 'Correr 5 km' }] }) })
    await waitFor(() => expect(heading()).toHaveTextContent(flow.confirm.question))
    await saveTime()
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData()).toMatchObject({ dueTime: '20:00', tagIds: ['tag-1'], goalIds: ['goal-1'] })
  })

  it('omits every relationship write when an unrelated field is saved before the authority loads', async () => {
    mountEdit({ relationshipFieldsLoaded: false })
    await waitFor(() => expect(heading()).toHaveTextContent(flow.confirm.question))
    await saveTime()
    expect(state.update).toHaveBeenCalledTimes(1)
    const data = updateData()
    expect(data).toMatchObject({ dueTime: '20:00' })
    expect(data).not.toHaveProperty('goalIds')
    expect(data).not.toHaveProperty('tagIds')
    expect(data).not.toHaveProperty('slipAlertEnabled')
  })

  it('replays a goal chosen before the authority loads onto the authoritative goals', async () => {
    const view = mountEdit({ relationshipFieldsLoaded: false })
    await toSummaryAfter(flow.optional.goals, () => press('Ler 12 livros, 10%'))
    view.rerender({ relationshipFieldsLoaded: true, habit: createMockHabit({ ...storedHabit, linkedGoals: [{ id: 'goal-1', title: 'Correr 5 km' }] }) })
    await press(ptBR.common.save)
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(updateData().goalIds).toEqual(['goal-1', 'goal-2'])
  })

  it('leaves the parent out of the update when it did not change', async () => {
    const parent = createMockHabitScheduleItem({ id: 'parent-1', title: 'Rotina da manhã', children: [] })
    const source = createMockHabitScheduleItem({ ...storedHabit, children: [] })
    inventory.read.mockImplementation((url: string) => Promise.resolve({ items: url.includes('isGeneral=true') ? [] : [parent, source], page: 1, pageSize: 200, totalCount: 2, totalPages: 1 }))
    state.detail = { ...storedHabit, parentId: null, children: [] }
    mountEdit()
    await waitFor(() => expect(heading()).toHaveTextContent(flow.confirm.question))
    await saveTime()
    expect(updateData()).not.toHaveProperty('parentId')
    expect(updateData()).not.toHaveProperty('clearParent')
  })

  describe.each([
    ['moves the habit into the parent chosen on the parent step', null, 'Rotina da manhã', { parentId: 'parent-1' }],
    ['clears the parent when the person picks the top level', 'parent-1', 'Sem hábito principal (nível raiz)', { clearParent: true }],
  ] as const)('the parent change that %s', (_name, baselineParent, choice, expected) => {
    it('sends only that change in the update', async () => {
      const parent = createMockHabitScheduleItem({ id: 'parent-1', title: 'Rotina da manhã', children: [] })
      const source = createMockHabitScheduleItem({ ...storedHabit, parentId: baselineParent, children: [] })
      inventory.read.mockImplementation((url: string) => Promise.resolve({ items: url.includes('isGeneral=true') ? [] : [parent, source], page: 1, pageSize: 200, totalCount: 2, totalPages: 1 }))
      state.detail = { ...storedHabit, parentId: baselineParent, children: [] }
      mountEdit()
      await toSummaryAfter(flow.optional.parent, async () => {
        await press(new RegExp('^' + escapeRegExp(flow.optional.parentRow)))
        await act(async () => { await vi.advanceTimersByTimeAsync(50) })
        await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp('^' + escapeRegExp(choice)) })) })
        await press('Fechar')
      })
      await press(ptBR.common.save)
      expect(state.update).toHaveBeenCalledTimes(1)
      const data = updateData()
      expect(data).toMatchObject(expected)
      expect(Object.keys(data).filter((key) => key === 'parentId' || key === 'clearParent')).toEqual(Object.keys(expected))
    })
  })
})
