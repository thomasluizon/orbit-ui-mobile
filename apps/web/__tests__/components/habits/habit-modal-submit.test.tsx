import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verificationValidationResponses } from '@orbit/shared/test-support/validation-fixtures'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { HabitList } from '@/components/habits/habit-list'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import { createApiClientError } from '@orbit/shared/utils/error-utils'

const editorParentState = vi.hoisted(() => ({ detail: undefined as import('@orbit/shared/types/habit').HabitDetail | undefined, items: [] as import('@orbit/shared/types/habit').HabitScheduleItem[] }))
beforeEach(() => { editorParentState.detail = undefined; editorParentState.items = [] })
const mutation = vi.hoisted(() => vi.fn())
const completion = vi.hoisted(() => vi.fn())
const detailRefetch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const tagManagement = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), assign: vi.fn() }))
const showError = vi.hoisted(() => vi.fn())
const showSuccess = vi.hoisted(() => vi.fn())
const showInfo = vi.hoisted(() => vi.fn())
const suggest = vi.hoisted(() => vi.fn())
let currentForm!: import('@/hooks/use-habit-form').HabitFormHelpers
let currentFields!: React.ComponentProps<typeof import('@/components/habits/habit-form-fields').HabitFormFields>
vi.mock('@/components/habits/habit-form-fields', async (original) => {
  const actual = await original<typeof import('@/components/habits/habit-form-fields')>()
  return { HabitFormFields: (props: React.ComponentProps<typeof actual.HabitFormFields>) => {
    currentForm = props.formHelpers
    currentFields = props
    return <actual.HabitFormFields {...props} />
  } }
})
const habit = createMockHabit({ title: 'Walk every day' })
const detailHabit = { ...makeHabitDetail(), title: 'Read', children: [], isGeneral: true, frequencyUnit: null, tags: [], linkedGoals: [], slipAlertEnabled: false, checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] }
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: detailHabit, isLoading: false, isError: false, refetch: vi.fn() }),
  useHabitCountLoaded: () => ({ count: 2, isLoaded: true }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  useHabits: (filters: { isGeneral?: boolean }) => ({ data: normalizeHabitQueryData(editorParentState.items.filter((item) => item.isGeneral === !!filters.isGeneral)), isSuccess: true, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))


vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map(), EMPTY_CHILDREN_BY_PARENT: new Map(), EMPTY_NORMALIZED_HABITS: [],
  useHabits: () => { const items = editorParentState.items; const normalized = React.useMemo(() => normalizeHabitQueryData(items), [items]); return { data: normalized, isSuccess: true, isLoading: false, isError: false, refetch: vi.fn(), getChildren: (id: string) => (normalized.childrenByParent.get(id) ?? []).map((child) => normalized.habitsById.get(child)!) } },
  useSkipHabit: () => ({ mutateAsync: completion, isPending: false }),
  useBulkLogHabits: () => ({ mutateAsync: completion, isPending: false }),
  useBulkSkipHabits: () => ({ mutateAsync: completion, isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: completion, isPending: false }),
  useReorderHabits: () => ({ mutate: completion, isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: completion, isPending: false }),
  useLogHabit: () => ({ mutateAsync: completion }),
  useUpdateChecklist: () => ({ mutateAsync: completion }),
  useDeleteHabit: () => ({ mutateAsync: completion }),
  useCreateHabit: () => useMutation({ mutationFn: mutation }),
  useCreateSubHabit: () => useMutation({ mutationFn: mutation }),
  useUpdateHabit: () => useMutation({ mutationFn: mutation }),
  useHabitDetail: (id: string | null) => ({ data: editorParentState.detail && editorParentState.detail.id === id ? editorParentState.detail : null, isPending: false, error: null, refetch: detailRefetch }),
}))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: suggest }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1, language: 'en' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { limits: { maxHabitDepth: 5 }, features: { 'sub_habits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({ useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTags: () => ({ tags: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Reading', color: '#C4530F' }] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: tagManagement.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: tagManagement.update }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: tagManagement.delete }),
  useAssignTags: () => ({ isPending: false, mutateAsync: tagManagement.assign }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError, showSuccess, showInfo }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => null }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

async function renderSheet(mode: 'create' | 'edit', selectedHabit = habit) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const element = (open: boolean) => <QueryClientProvider client={client}>
    {mode === 'create'
      ? <CreateHabitModal open={open} onOpenChange={onClose} initialTitle={habit.title} />
      : <EditHabitModal open={open} onOpenChange={onClose} habit={selectedHabit} onSaved={onSaved} />}
  </QueryClientProvider>
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(element(true)) })
  if (mode === 'create') await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeHabit' })))
  return { onSaved, onClose, setOpen: async (open: boolean) => { await act(async () => view.rerender(element(open))) }, title: screen.getByRole('textbox', { name: 'habits.form.describe' }), submit: screen.getByRole('button', { name: mode === 'create' ? 'habits.createHabit' : 'common.save' }) }
}

describe('offline habit editor', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => {
    vi.restoreAllMocks()
    act(() => { globalThis.dispatchEvent(new Event('online')) })
  })

  it.each([true, false])('keeps the loaded draft editable offline and saves once after reconnecting (initially online: %s)', async (initiallyOnline) => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(initiallyOnline)
    mutation.mockResolvedValue(undefined)
    const selectedHabit = createMockHabit({
      frequencyUnit: 'Day', startDate: '2026-08-20', description: 'Before editing',
      checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }],
    })
    const { title, submit, onClose, onSaved } = await renderSheet('edit', selectedHabit)
    act(() => {
      online.mockReturnValue(false)
      globalThis.dispatchEvent(new Event('offline'))
    })
    const description = screen.getByRole('textbox', { name: 'habits.form.description' })
    const checklist = screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })[0]!
    const datePicker = screen.getByRole('button', { name: 'habits.form.habitStartDate, common.selectedDate' })
    expect(submit).toBeDisabled()
    expect(title.closest('fieldset')).not.toBeDisabled()
    for (const control of [title, description, checklist, datePicker]) expect(control).toBeEnabled()

    const user = userEvent.setup()
    await user.clear(title)
    await user.type(title, 'Offline title')
    await user.clear(description)
    await user.type(description, 'Offline description')
    await user.clear(checklist)
    await user.type(checklist, 'Pack the blue bag')
    await user.click(datePicker)
    const calendar = screen.getByRole('dialog', { name: 'common.selectDate' })
    const day = calendar.querySelector<HTMLButtonElement>('button[data-day="2026-08-21"]')!
    expect(day).toBeEnabled()
    await user.click(day)
    expect(screen.queryByRole('dialog', { name: 'common.selectDate' })).not.toBeInTheDocument()
    expect(currentForm.form.getValues('dueDate')).toBe('2026-08-21')

    await user.click(submit)
    await act(async () => fireEvent.submit(title.closest('form')!))
    expect(mutation).not.toHaveBeenCalled()
    expect(completion).not.toHaveBeenCalled()
    for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    act(() => {
      online.mockReturnValue(true)
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(title).toHaveValue('Offline title')
    expect(description).toHaveValue('Offline description')
    expect(checklist).toHaveValue('Pack the blue bag')
    expect(currentForm.form.getValues('dueDate')).toBe('2026-08-21')
    expect(submit).toBeEnabled()
    await user.click(submit)
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledExactlyOnceWith(false)
    expect(mutation).toHaveBeenCalledOnce()
    expect(mutation.mock.calls[0]![0]).toMatchObject({
      habitId: selectedHabit.id,
      data: {
        title: 'Offline title', description: 'Offline description', startDate: '2026-08-21',
        checklistItems: [{ text: 'Pack the blue bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }],
      },
    })
  })
})

describe.each(['create', 'edit'] as const)('habit %s submit', (mode) => {
  beforeEach(() => { vi.resetAllMocks() })

  it('discards backend errors and focus requests when a persistent owner opens a matching draft', async () => {
    const messages = verificationValidationResponses.en.errors.Code
    mutation.mockRejectedValue({ errors: { Title: [...messages] } })
    const { title, submit, setOpen } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: habit.title } }))
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    expect(currentForm.backendFocusRequest).toBeGreaterThan(0)
    await setOpen(false)
    await setOpen(true)
    const nextTitle = screen.getByRole('textbox', { name: 'habits.form.describe' })
    expect(nextTitle).toHaveValue(habit.title)
    expect(nextTitle).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(messages.join('\n'))).not.toBeInTheDocument()
    expect(currentForm.backendFocusRequest).toBe(0)
    expect(currentForm.backendFocusField).toBeUndefined()
  })

  it.each(['', '   '])('focuses an invalid title and shows its inline error after submit (%j)', async (value) => {
    const { title, submit } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value } }))
    expect(submit).toBeEnabled()
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(title).toHaveFocus())
    const error = document.getElementById(title.getAttribute('aria-describedby') ?? '')
    expect(error).toHaveTextContent('habits.form.titleRequired')
    expect(error).toHaveAttribute('role', 'alert')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(mutation).not.toHaveBeenCalled()
  })

  it('keeps its label and shows a spinner only while the request runs', async () => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(habit) }))
    const { title, submit, onClose } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: 'Walk every day' } }))
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'))
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent(mode === 'create' ? 'habits.createHabit' : 'common.save')
    expect(submit.querySelector('svg')).not.toBeNull()
    await act(async () => fireEvent.click(submit))
    expect(mutation).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await waitFor(() => expect(submit).toBeEnabled())
    expect(submit).not.toHaveAttribute('aria-busy')
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('allows retry after the request fails', async () => {
    mutation.mockRejectedValue(new Error('offline'))
    const { title, submit, onClose } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: 'Walk every day' } }))
    await act(async () => fireEvent.click(submit))
    if (mode === 'edit') await waitFor(() => expect(screen.getByText('habits.form.saveUncertain')).toBeInTheDocument())
    else await waitFor(() => expect(showError).toHaveBeenCalled())
    await waitFor(() => expect(submit).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    mutation.mockResolvedValue(habit)
    if (mode === 'edit') detailRefetch.mockResolvedValueOnce({ isSuccess: true, data: { ...makeHabitDetail(), parentId: null } })
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false))
  })
})

function deferred<Result>() {
  let resolve!: (result: Result) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Result>((accept, refuse) => { resolve = accept; reject = refuse })
  return { promise, resolve, reject }
}

describe('submitted editor suggestion ownership', () => {
  const selectedHabit = createMockHabit({
    title: 'Practice reading', emoji: '📚', frequencyUnit: 'Day', frequencyQuantity: 1,
    days: ['Monday', 'Thursday'], dueTime: '08:00',
    checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }],
  })
  const response: HabitSetupSuggestion = {
    emoji: '🏊', frequencyUnit: 'Week', frequencyQuantity: 3, days: ['Tuesday'],
    isFlexible: true, flexibleTarget: 3, dueTime: '07:00', subHabits: [], checklistItems: ['Towel'],
  }
  const emptyResponse: HabitSetupSuggestion = {
    emoji: null, frequencyUnit: null, frequencyQuantity: null, days: [],
    isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [],
  }
  beforeEach(() => { vi.resetAllMocks() })

  describe.each(['onSuggestEmoji', 'onSuggestSetup'] as const)('%s', (callback) => {
    it.each([
      ['applied', 'success'], ['empty', 'success'], ['rejected', 'success'],
      ['applied', 'rejected'], ['empty', 'rejected'], ['rejected', 'rejected'],
    ] as const)('retires a late %s response through %s Save', async (suggestionOutcome, saveOutcome) => {
      const suggestion = deferred<HabitSetupSuggestion>()
      const save = deferred<void>()
      suggest.mockReturnValue(suggestion.promise)
      mutation.mockReturnValue(save.promise)
      const { submit, onClose } = await renderSheet('edit', selectedHabit)
      let proposal!: ReturnType<NonNullable<typeof currentFields.onSuggestSetup>>
      await act(async () => { proposal = currentFields[callback]!() })
      expect(suggest).toHaveBeenCalledOnce()
      const draft = structuredClone(currentForm.form.getValues())
      await act(async () => fireEvent.click(submit))
      await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
      const submitted = structuredClone(mutation.mock.calls[0]![0])
      expect(submitted.data).toMatchObject({ emoji: '📚', frequencyUnit: 'Day', frequencyQuantity: 1, dueTime: '08:00', checklistItems: selectedHabit.checklistItems })
      await act(async () => {
        if (suggestionOutcome === 'rejected') suggestion.reject(new Error('suggestion unavailable'))
        else suggestion.resolve(suggestionOutcome === 'empty' ? emptyResponse : response)
        await proposal
      })
      expect(currentForm.form.getValues()).toEqual(draft)
      expect(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' }).map((input) => (input as HTMLInputElement).value)).toEqual(['Pack a bag', 'Read a chapter'])
      expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Practice reading')
      expect(currentFields.emojiSuggestionError).toBeUndefined()
      expect(currentFields.emojiSuggestionLimitReached).toBeFalsy()
      expect(showSuccess).not.toHaveBeenCalled()
      expect(showInfo).not.toHaveBeenCalled()
      expect(showError).not.toHaveBeenCalled()
      await act(async () => { await currentFields.onSuggestEmoji!(); await currentFields.onSuggestSetup!() })
      expect(suggest).toHaveBeenCalledOnce()
      expect(submit).toBeDisabled()
      expect(submit).toHaveTextContent('common.save')
      await act(async () => {
        if (saveOutcome === 'success') save.resolve()
        else save.reject(createApiClientError(403, { error: 'Forbidden' }, 'Forbidden'))
      })
      await waitFor(() => expect(submit).toBeEnabled())
      expect(mutation.mock.calls[0]![0]).toEqual(submitted)
      expect(currentForm.form.getValues()).toEqual(draft)
      if (saveOutcome === 'success') expect(onClose).toHaveBeenCalledExactlyOnceWith(false)
      else {
        expect(onClose).not.toHaveBeenCalled()
        expect(detailRefetch).not.toHaveBeenCalled()
        expect(screen.queryByText('habits.form.saveUncertain')).not.toBeInTheDocument()
        suggest.mockResolvedValue(response)
        await act(async () => { await currentFields[callback]!() })
        expect(currentForm.form.getValues('emoji')).toBe('🏊')
        expect(showSuccess).toHaveBeenCalledExactlyOnceWith('habits.form.aiSuggestApplied')
        if (callback === 'onSuggestSetup') {
          expect(currentForm.form.getValues('checklistItems')).toEqual([...selectedHabit.checklistItems, { text: 'Towel', isChecked: false }])
          expect(currentForm.form.getValues('dueTime')).toBe('07:00')
        }
      }
    })

    it('accepts an intentional suggestion before submission', async () => {
      suggest.mockResolvedValue(response)
      await renderSheet('edit', selectedHabit)
      await act(async () => { await currentFields[callback]!() })
      expect(currentForm.form.getValues('emoji')).toBe('🏊')
      expect(showSuccess).toHaveBeenCalledExactlyOnceWith('habits.form.aiSuggestApplied')
      expect(mutation).not.toHaveBeenCalled()
    })

    it('keeps suggestions available after invalid submission', async () => {
      suggest.mockResolvedValue(response)
      const { title, submit } = await renderSheet('edit', selectedHabit)
      await act(async () => fireEvent.change(title, { target: { value: '' } }))
      await act(async () => fireEvent.click(submit))
      await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
      await act(async () => fireEvent.change(title, { target: { value: 'Practice reading' } }))
      await act(async () => { await currentFields[callback]!() })
      expect(currentForm.form.getValues('emoji')).toBe('🏊')
      expect(showSuccess).toHaveBeenCalledExactlyOnceWith('habits.form.aiSuggestApplied')
      expect(mutation).not.toHaveBeenCalled()
    })
  })
})

describe('habit edit start date', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it.each([
    ['2026-01-01', '2026-01-01'],
    ['2026-08-20', '2026-08-20'],
    ['2026-08-28', '2026-08-28'],
    [undefined, '2026-08-29'],
  ])('shows the API start date %s with legacy timestamp compatibility', async (startDate, expected) => {
    const selectedHabit = { ...habit, startDate, createdAtUtc: '2026-08-29T00:30:00Z' }
    await renderSheet('edit', selectedHabit)
    expect(currentForm.form.getValues('dueDate')).toBe(expected)
  })
})

describe('mounted habit form identifiers', () => {
  beforeEach(() => { vi.resetAllMocks() })

  async function renderOwners(secondMode: 'create' | 'edit') {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    await act(async () => {
      render(<QueryClientProvider client={client}>
        <section aria-label="First owner"><CreateHabitModal open presentation="screen" onOpenChange={vi.fn()} initialTitle={habit.title} /></section>
        <section aria-label="Second owner">{secondMode === 'create'
          ? <CreateHabitModal open presentation="screen" onOpenChange={vi.fn()} initialTitle={habit.title} />
          : <EditHabitModal open onOpenChange={vi.fn()} habit={habit} />}</section>
      </QueryClientProvider>)
    })
    return [screen.getByRole('region', { name: 'First owner' }), screen.getByRole('region', { name: 'Second owner' })] as const
  }

  it.each(['create', 'edit'] as const)('keeps phrase labels and focus with their owner beside %s', async (secondMode) => {
    const owners = await renderOwners(secondMode)
    const user = userEvent.setup()
    for (const owner of owners) {
      const title = owner.querySelector<HTMLTextAreaElement>('textarea')!
      const label = within(owner).getByText('habits.form.describe', { selector: 'label' }) as HTMLLabelElement
      expect(label.control).toBe(title)
      expect(title).toHaveAccessibleName('habits.form.describe')
      await user.click(label)
      expect(title).toHaveFocus()
    }
  })

  it.each(['create', 'edit'] as const)('keeps phrase errors with their owner beside %s', async (secondMode) => {
    const owners = await renderOwners(secondMode)
    const user = userEvent.setup()
    for (const owner of owners) {
      const title = owner.querySelector<HTMLTextAreaElement>('textarea')!
      await user.click(within(owner).getByRole('radio', { name: 'habits.form.typeTask' }))
      await user.clear(title)
      await user.click(within(owner).getByRole('button', { name: owner === owners[0] || secondMode === 'create' ? 'habits.createHabit' : 'common.save' }))
      await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
      const error = document.getElementById(title.getAttribute('aria-describedby') ?? '')
      expect(error).toHaveTextContent('habits.form.titleRequired')
      expect(owner).toContainElement(error)
    }
    expect(mutation).not.toHaveBeenCalled()
  })

  it('keeps simultaneous required-type errors attached as another owner recovers', async () => {
    const owners = await renderOwners('create')
    for (const owner of owners) {
      await act(async () => fireEvent.click(within(owner).getByRole('button', { name: 'habits.createHabit' })))
    }
    const groups = owners.map((owner) => within(owner).getByRole('radiogroup'))
    const errorIds = groups.map((group) => group.getAttribute('aria-describedby'))
    for (const [index, group] of groups.entries()) {
      expect(group).toHaveAttribute('aria-invalid', 'true')
      const error = document.getElementById(errorIds[index] ?? '')
      expect(error).toHaveTextContent('habits.form.typeRequired')
      expect(owners[index]).toContainElement(error)
    }
    await act(async () => fireEvent.click(within(owners[0]).getByRole('radio', { name: 'habits.form.typeHabit' })))
    expect(groups[0]).not.toHaveAttribute('aria-describedby')
    expect(groups[1]).toHaveAttribute('aria-describedby', errorIds[1])
    expect(document.getElementById(errorIds[1] ?? '')).toHaveTextContent('habits.form.typeRequired')
    expect(mutation).not.toHaveBeenCalled()
  })
})

describe('controlled full editor checklist', () => {
  const editedHabit = createMockHabit({ isGeneral: true, frequencyUnit: null, checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] })
  beforeEach(() => { vi.resetAllMocks() })

  it('stages typing, blur, duplication, removal and structural clear, then discards through Cancel', async () => {
    const { onClose } = await renderSheet('edit', editedHabit)
    const inputs = screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })
    fireEvent.change(inputs[0]!, { target: { value: 'Pack a blue bag' } })
    fireEvent.blur(inputs[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'habits.form.duplicateChecklistItem' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'habits.form.removeChecklistItem' })[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.clearChecklist' }))
    expect(mutation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(screen.getByText('common.discardChangesDescription')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.discardChangesAction' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false))
    expect(mutation).not.toHaveBeenCalled()
    expect(editedHabit.checklistItems).toEqual([{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }])
  })

  it('sends the ordered mixed checked states, explicit clears and tags through one Save', async () => {
    mutation.mockResolvedValue(undefined)
    const { submit } = await renderSheet('edit', editedHabit)
    fireEvent.change(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })[0]!, { target: { value: 'Pack a blue bag' } })
    expect(mutation).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
    expect(mutation.mock.calls[0]![0].data).toMatchObject({ description: '', goalIds: [], tagIds: [], checklistItems: [{ text: 'Pack a blue bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] })
  })
})

vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-08-29' }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => <main>{header}{children}</main> }))

it('opens the real full editor from detail and keeps checklist edits out of both mutation paths until Save', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  completion.mockReset()
  editorParentState.detail = { ...detailHabit, parentId: null }
  editorParentState.items = [createMockHabitScheduleItem({ ...detailHabit, children: [] }), createMockHabitScheduleItem({ id: parentDestination, title: 'Completed off-day destination', isGeneral: true, frequencyUnit: null, isCompleted: true, children: [] })]
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><HabitDetailScreen habitId="habit-1" /></QueryClientProvider>)
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'habits.form.clearChecklist' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'habits.editHabit' }))
  await chooseEditorParent()
  const item = screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })[0]!
  fireEvent.change(item, { target: { value: 'Pack a blue bag' } })
  fireEvent.blur(item)
  fireEvent.click(screen.getAllByRole('button', { name: 'habits.form.removeChecklistItem' })[1]!)
  expect(mutation).not.toHaveBeenCalled()
  expect(completion).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data.checklistItems).toEqual([{ text: 'Pack a blue bag', isChecked: true }])
  expect(mutation.mock.calls[0]![0].data.parentId).toBe(parentDestination)
  expect(completion).not.toHaveBeenCalled()
})

it('keeps mixed checked states and stable text identity through the actual keyboard reorder adapter', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  const selected = createMockHabit({ isGeneral: true, frequencyUnit: null, checklistItems: [{ text: 'First', isChecked: true }, { text: 'Second', isChecked: false }] })
  const { submit } = await renderSheet('edit', selected)
  const first = screen.getByDisplayValue('First') as HTMLInputElement
  first.setSelectionRange(2, 2)
  const handles = document.querySelectorAll<HTMLElement>('[aria-roledescription]')
  vi.spyOn(handles[0]!.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 80))
  vi.spyOn(handles[1]!.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 200, 80))
  handles[0]!.focus()
  fireEvent.keyDown(handles[0]!, { code: 'Space', key: ' ' })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  fireEvent.keyDown(document, { code: 'ArrowDown' })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  fireEvent.keyDown(document, { code: 'Space' })
  await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' }).map((input) => (input as HTMLInputElement).value)).toEqual(['Second', 'First']))
  expect(screen.getByDisplayValue('First')).toBe(first)
  expect(first.selectionStart).toBe(2)
  expect(mutation).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data.checklistItems).toEqual([{ text: 'Second', isChecked: false }, { text: 'First', isChecked: true }])
})

it('selects an existing tag locally and commits its association only with the habit Save', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  const { submit } = await renderSheet('edit', createMockHabit({ isGeneral: true, frequencyUnit: null }))
  fireEvent.click(screen.getByRole('button', { name: /habits.form.tags/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }))
  expect(mutation).not.toHaveBeenCalled()
  for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data.tagIds).toEqual(['11111111-1111-4111-8111-111111111111'])
  for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
})

it('retains an uncertain submitted draft, requests fresh readback and allows an explicit retry', async () => {
  mutation.mockReset().mockRejectedValue(new Error('timeout'))
  detailRefetch.mockClear()
  const { title, submit, onClose, onSaved } = await renderSheet('edit')
  fireEvent.change(title, { target: { value: 'Keep this draft' } })
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(detailRefetch).toHaveBeenCalledOnce())
  expect(title).toHaveValue('Keep this draft')
  expect(screen.getByText('habits.form.saveUncertain')).toBeVisible()
  expect(onClose).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(submit).toBeEnabled()
  mutation.mockResolvedValue(undefined)
  detailRefetch.mockResolvedValueOnce({ isSuccess: true, data: { ...makeHabitDetail(), parentId: null } })
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
})

it('keeps explicit tag creation independent when the habit draft is discarded', async () => {
  mutation.mockReset()
  for (const write of Object.values(tagManagement)) write.mockReset()
  tagManagement.create.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', name: 'Independent', color: '#C4530F' })
  const { onClose } = await renderSheet('edit', createMockHabit({ isGeneral: true, frequencyUnit: null }))
  fireEvent.click(screen.getByRole('button', { name: /habits.form.tags/ }))
  fireEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
  const name = screen.getByRole('textbox', { name: 'habits.form.tagName' })
  fireEvent.change(name, { target: { value: 'Independent' } })
  fireEvent.blur(name)
  expect(tagManagement.create).not.toHaveBeenCalled()
  const add = screen.getAllByRole('button', { name: 'common.add' }).find((button) => !(button as HTMLButtonElement).disabled)!
  await act(async () => fireEvent.click(add))
  expect(tagManagement.create).toHaveBeenCalledOnce()
  expect(mutation).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'common.discardChangesAction' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(tagManagement.create).toHaveBeenCalledOnce()
  expect(tagManagement.delete).not.toHaveBeenCalled()
  expect(tagManagement.assign).not.toHaveBeenCalled()
  expect(mutation).not.toHaveBeenCalled()
})

const parentDestination = '22222222-2222-4222-8222-222222222222'
function prepareParentEditor(parentId: string | null | undefined = null) {
  const source = createMockHabit({ id: 'source-parent-edit', title: 'Read', frequencyUnit: 'Day', startDate: '2026-08-20', checklistItems: [{ text: 'Same', isChecked: true }, { text: 'Same', isChecked: false }] })
  editorParentState.detail = { ...source, parentId, children: [] }
  editorParentState.items = [createMockHabitScheduleItem({ ...source, children: [] }), createMockHabitScheduleItem({ id: parentDestination, title: 'Completed off-day destination', frequencyUnit: null, isCompleted: true, scheduledDates: [], children: [] })]
  return source
}

async function chooseEditorParent(name = 'Completed off-day destination') {
  fireEvent.click(screen.getByRole('button', { name: /habits.form.parentHabit/ }))
  const picker = await screen.findByRole('dialog', { name: 'habits.form.parentHabit' })
  fireEvent.click(within(picker).getByRole('radio', { name: new RegExp(`^${name}`) }))
  fireEvent.click(within(picker).getByRole('button', { name: 'close-overlay' }))
}

it('stages a completed destination and all complete editor fields through picker close, then saves one ordinary update', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  completion.mockReset()
  for (const write of Object.values(tagManagement)) write.mockReset()
  const source = prepareParentEditor()
  const { submit, title } = await renderSheet('edit', source)
  await chooseEditorParent()
  fireEvent.change(title, { target: { value: 'Read together' } })
  expect(screen.getByRole('button', { name: /habits.form.parentHabit/ })).toHaveTextContent('Completed off-day destination')
  expect(mutation).not.toHaveBeenCalled()
  expect(completion).not.toHaveBeenCalled()
  for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data).toMatchObject({ title: 'Read together', parentId: parentDestination, checklistItems: source.checklistItems, tagIds: [], goalIds: [], startDate: '2026-08-20' })
  expect(mutation.mock.calls[0]![0].data).not.toHaveProperty('clearParent')
})

it('discards a local parent choice on Cancel and reopens the authoritative baseline', async () => {
  mutation.mockReset()
  const source = prepareParentEditor()
  const { onClose, setOpen } = await renderSheet('edit', source)
  await chooseEditorParent()
  fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'common.discardChangesAction' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(mutation).not.toHaveBeenCalled()
  await setOpen(false)
  await setOpen(true)
  expect(screen.getByRole('button', { name: /habits.form.parentHabit/ })).toHaveTextContent('habits.moveParent.toRoot')
})

it.each([null, undefined])('omits untouched parent keys with baseline %s', async (parentId) => {
  mutation.mockReset().mockResolvedValue(undefined)
  const source = prepareParentEditor(parentId)
  if (parentId === undefined) editorParentState.detail!.parentId = undefined
  const { submit } = await renderSheet('edit', source)
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data).not.toHaveProperty('parentId')
  expect(mutation.mock.calls[0]![0].data).not.toHaveProperty('clearParent')
})

it('serializes explicit root independently from missing readback and ignores late baseline changes after choice', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  const source = prepareParentEditor(parentDestination)
  const { submit } = await renderSheet('edit', source)
  await chooseEditorParent('habits.moveParent.toRoot')
  editorParentState.detail = { ...editorParentState.detail!, parentId: '33333333-3333-4333-8333-333333333333' }
  fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.description' }), { target: { value: 'Keep local root' } })
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data).toMatchObject({ clearParent: true, description: 'Keep local root' })
  expect(mutation.mock.calls[0]![0].data).not.toHaveProperty('parentId')
})

it('refuses an uncertain retry when authoritative readback is unavailable', async () => {
  mutation.mockReset().mockRejectedValue(new Error('timeout'))
  detailRefetch.mockReset().mockResolvedValue({ isSuccess: false, data: undefined })
  const { submit, title } = await renderSheet('edit', prepareParentEditor())
  await chooseEditorParent()
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  await act(async () => fireEvent.click(submit))
  expect(mutation).toHaveBeenCalledOnce()
  expect(title).toHaveValue('Read')
  expect(screen.getByText('habits.form.saveUncertain')).toBeVisible()
})

it('opens the same real complete editor through the list row menu and stages a parent until Save', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  completion.mockReset()
  prepareParentEditor()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><HabitList filters={{}} view="all" /></QueryClientProvider>)
  fireEvent.pointerDown(screen.getAllByRole('button', { name: 'habits.actions.more' })[0]!, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'common.edit' }))
  expect(await screen.findByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
  expect(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })).toHaveLength(2)
  await chooseEditorParent()
  expect(mutation).not.toHaveBeenCalled()
  expect(completion).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data.parentId).toBe(parentDestination)
})

it('keeps the complete parent draft after a definitive destination refusal without another write', async () => {
  mutation.mockReset().mockRejectedValue(createApiClientError(409, { errorCode: 'CONCURRENT_UPDATE_CONFLICT' }, 'Conflict'))
  completion.mockReset()
  detailRefetch.mockClear()
  const { submit, title, onClose } = await renderSheet('edit', prepareParentEditor())
  await chooseEditorParent()
  fireEvent.change(title, { target: { value: 'Retained title' } })
  await act(async () => fireEvent.click(submit))
  await waitFor(() => expect(submit).toBeEnabled())
  expect(mutation).toHaveBeenCalledOnce()
  expect(completion).not.toHaveBeenCalled()
  expect(detailRefetch).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(title).toHaveValue('Retained title')
  expect(screen.getByText('toast.errors.conflict')).toBeVisible()
  expect(screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' }).map((input) => (input as HTMLInputElement).value)).toEqual(['Same', 'Same'])
  expect(screen.getByRole('button', { name: /habits.form.parentHabit/ })).toHaveTextContent('Completed off-day destination')
})
