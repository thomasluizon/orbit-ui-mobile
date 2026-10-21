import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificationValidationResponses } from '@orbit/shared/test-support/validation-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mutation = vi.hoisted(() => vi.fn())
const completion = vi.hoisted(() => vi.fn())
const detailRefetch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const tagManagement = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), assign: vi.fn() }))
const showError = vi.hoisted(() => vi.fn())
let currentForm!: import('@/hooks/use-habit-form').HabitFormHelpers
vi.mock('@/components/habits/habit-form-fields', async (original) => {
  const actual = await original<typeof import('@/components/habits/habit-form-fields')>()
  return { HabitFormFields: (props: React.ComponentProps<typeof actual.HabitFormFields>) => {
    currentForm = props.formHelpers
    return <actual.HabitFormFields {...props} />
  } }
})
const habit = createMockHabit({ title: 'Walk every day' })
const detailHabit = { ...makeHabitDetail(), title: 'Read', children: [], isGeneral: true, frequencyUnit: null, tags: [], linkedGoals: [], slipAlertEnabled: false, checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] }
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: detailHabit, isLoading: false, isError: false, refetch: vi.fn() }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  useHabits: () => ({ data: { habitsById: new Map(), topLevelHabits: [] }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))


vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: completion }),
  useUpdateChecklist: () => ({ mutateAsync: completion }),
  useDeleteHabit: () => ({ mutateAsync: completion }),
  useCreateHabit: () => useMutation({ mutationFn: mutation }),
  useCreateSubHabit: () => useMutation({ mutationFn: mutation }),
  useUpdateHabit: () => useMutation({ mutationFn: mutation }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null, refetch: detailRefetch }),
}))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1, language: 'en' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'sub_habits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({ useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTags: () => ({ tags: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Reading', color: '#C4530F' }] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: tagManagement.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: tagManagement.update }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: tagManagement.delete }),
  useAssignTags: () => ({ isPending: false, mutateAsync: tagManagement.assign }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => null }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

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
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false))
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
    expect(screen.getByText('habits.form.unsavedHabit')).toBeInTheDocument()
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><HabitDetailScreen habitId="habit-1" /></QueryClientProvider>)
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'habits.form.clearChecklist' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'habits.editHabit' }))
  const item = screen.getAllByRole('textbox', { name: 'habits.form.checklistItemLabel' })[0]!
  fireEvent.change(item, { target: { value: 'Pack a blue bag' } })
  fireEvent.blur(item)
  fireEvent.click(screen.getAllByRole('button', { name: 'habits.form.removeChecklistItem' })[1]!)
  expect(mutation).not.toHaveBeenCalled()
  expect(completion).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'common.save' })))
  await waitFor(() => expect(mutation).toHaveBeenCalledOnce())
  expect(mutation.mock.calls[0]![0].data.checklistItems).toEqual([{ text: 'Pack a blue bag', isChecked: true }])
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
