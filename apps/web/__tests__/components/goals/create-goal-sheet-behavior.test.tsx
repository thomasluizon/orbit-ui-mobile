import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'created-goal' }),
  pending: false,
  habitFormReady: Promise.resolve(),
  locale: 'en',
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
  useLocale: () => mocks.locale,
}))
vi.mock('@/components/habits/create-habit-modal', async () => {
  await mocks.habitFormReady
  return { CreateHabitModal: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => <button type="button" onClick={() => onOpenChange(false)}>Finish habit creation</button> }
})
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Deadline" type="date" value={value} onChange={(event) => onChange(event.target.value)} />,
}))

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: 'created-goal' })
  mocks.pending = false
  mocks.locale = 'en'
  mocks.habits.data.habitsById.clear()
  mocks.habits.isLoading = false
  mocks.habits.isError = false
  mocks.habits.refetch.mockClear()
})

function fillGoal() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Read every day' } })
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'books' } })
}

async function openHabitPicker() {
  fireEvent.click(screen.getByRole('button', { name: /Linked habits/ }))
  return screen.findByRole('dialog', { name: 'Linked habits' })
}

describe('goal creation with habits', () => {
  it.each(['en', 'pt-BR'])('explains habit progress and avoided days only for selected habits in %s', async (locale) => {
    mocks.locale = locale
    const messages = locale === 'en' ? en : ptBR
    const habit = createMockHabit({ id: 'habit-caffeine', title: 'Caffeine', isBadHabit: true })
    mocks.habits.data.habitsById.set(habit.id, habit)
    render(<CreateGoalSheet open onClose={vi.fn()} />)
    expect(screen.getByText(messages.goals.form.habitsExplainer)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(messages.goals.linkedHabits) }))
    const picker = await screen.findByRole('dialog', { name: messages.goals.linkedHabits })
    expect(screen.queryByText(messages.goals.form.avoidedDays)).not.toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: habit.title, pressed: false }))
    expect(within(picker).getByText(messages.goals.form.avoidedDays)).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: messages.common.done }))
    expect(await screen.findByText(messages.goals.form.avoidedDays)).toBeInTheDocument()
  })

  it('opens habit creation from the empty picker and returns to the goal draft', async () => {
    let finishLoad!: () => void
    mocks.habitFormReady = new Promise<void>((resolve) => { finishLoad = resolve })
    render(<CreateGoalSheet open onClose={vi.fn()} />)
    fillGoal()
    await openHabitPicker()
    expect(screen.getByText('Start with a habit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create habit' }))
    expect(screen.getByRole('button', { name: 'Create habit' })).toBeDisabled()
    expect(screen.getByRole('dialog', { name: 'Linked habits' })).toBeInTheDocument()
    await act(async () => { finishLoad(); await import('@/components/habits/create-habit-modal') })
    fireEvent.click(await screen.findByRole('button', { name: 'Finish habit creation' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Read every day')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('keeps a failed save visible and preserves selected habits for retry', async () => {
    const onClose = vi.fn()
    mocks.create.mockRejectedValueOnce(new Error('save failed'))
    render(<CreateGoalSheet open onClose={onClose} initialHabitIds={['habit-reading']} />)
    fillGoal()
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en.goals.form.createError)
    expect(screen.getByLabelText('Title')).toHaveValue('Read every day')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ habitIds: ['habit-reading'] }))
  })

  it('saves a streak, deadline and selected habits in one create request', async () => {
    const habit = createMockHabit({ id: 'habit-reading', title: 'Read' })
    mocks.habits.data.habitsById.set(habit.id, habit)
    const secondHabit = createMockHabit({ id: 'habit-library', title: 'Visit the library' })
    mocks.habits.data.habitsById.set(secondHabit.id, secondHabit)
    const onClose = vi.fn()
    const onCreated = vi.fn()
    render(<CreateGoalSheet open onClose={onClose} onCreated={onCreated} />)
    fillGoal()
    fireEvent.click(screen.getByRole('radio', { name: 'Streak' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add deadline' }))
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2099-12-01' } })
    const picker = await openHabitPicker()
    fireEvent.click(within(picker).getByRole('button', { name: 'Read', pressed: false }))
    fireEvent.click(within(picker).getByRole('button', { name: secondHabit.title, pressed: false }))
    expect(within(picker).getByRole('button', { name: 'Read', pressed: true })).toBeEnabled()
    fireEvent.click(within(picker).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Linked habits' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenCalledWith({ title: 'Read every day', type: 'Streak', targetValue: 12, unit: 'consecutive days', deadline: '2099-12-01', habitIds: [habit.id, secondHabit.id] })
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(onCreated).toHaveBeenCalledWith('created-goal', [habit.id, secondHabit.id])
  })

  it('keeps the current habit selected and enforces capacity without blocking deselection', async () => {
    const habits = Array.from({ length: 21 }, (_, index) => createMockHabit({ id: `habit-${index}`, title: `Habit ${index}` }))
    mocks.habits.data.habitsById = new Map(habits.map((habit) => [habit.id, habit]))
    render(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={habits.slice(0, 20).map((habit) => habit.id)} />)
    const picker = await openHabitPicker()
    fireEvent.change(within(picker).getByRole('textbox', { name: 'Search habits' }), { target: { value: 'Habit 20' } })
    expect(within(picker).getByRole('button', { name: 'Habit 20', pressed: false })).toBeDisabled()
    fireEvent.change(within(picker).getByRole('textbox', { name: 'Search habits' }), { target: { value: 'Habit 0' } })
    fireEvent.click(within(picker).getByRole('button', { name: 'Habit 0', pressed: true }))
    fireEvent.change(within(picker).getByRole('textbox', { name: 'Search habits' }), { target: { value: 'Habit 20' } })
    expect(within(picker).getByRole('button', { name: 'Habit 20', pressed: false })).toBeEnabled()
    fireEvent.change(within(picker).getByRole('textbox', { name: 'Search habits' }), { target: { value: 'absent' } })
    expect(within(picker).getByText(en.habits.moveParent.noSearchResults)).toBeInTheDocument()
  })

  it('saves without the current habit when it is deselected', async () => {
    const habit = createMockHabit({ id: 'habit-reading', title: 'Read' })
    mocks.habits.data.habitsById.set(habit.id, habit)
    render(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={[habit.id]} />)
    fillGoal()
    const picker = await openHabitPicker()
    fireEvent.click(within(picker).getByRole('button', { name: 'Read', pressed: true }))
    fireEvent.click(within(picker).getByRole('button', { name: 'Done' }))
    await screen.findByLabelText('Title')
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ habitIds: [] })))
  })

  it('shows loading and lets a failed habit list retry while keeping the goal draft', async () => {
    mocks.habits.isLoading = true
    const { rerender } = render(<CreateGoalSheet open onClose={vi.fn()} />)
    fillGoal()
    await openHabitPicker()
    expect(within(screen.getByRole('dialog', { name: 'Linked habits' })).getByLabelText(en.common.loading)).toBeInTheDocument()
    mocks.habits.isLoading = false
    mocks.habits.isError = true
    rerender(<CreateGoalSheet open onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load habits')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.habits.refetch).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Read every day'))
  })

  it.each(['en', 'pt-BR'])('keeps the submit label and disables it while saving in %s', (locale) => {
    mocks.locale = locale
    mocks.pending = true
    render(<CreateGoalSheet open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: locale === 'en' ? 'Create goal' : 'Criar meta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: locale === 'en' ? 'Cancel' : 'Cancelar' })).toBeDisabled()
  })
})
