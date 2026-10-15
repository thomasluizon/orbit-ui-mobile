import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'created-goal' }),
  pending: false,
  locale: 'en',
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
  useLocale: () => mocks.locale,
}))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }) }))
vi.mock('@/hooks/use-habits', () => ({ useHabits: () => mocks.habits }))
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
  it('saves a streak, deadline and selected habits in one create request', async () => {
    const habit = createMockHabit({ id: 'habit-reading', title: 'Read' })
    mocks.habits.data.habitsById.set(habit.id, habit)
    const onClose = vi.fn()
    const onCreated = vi.fn()
    render(<CreateGoalSheet open onClose={onClose} onCreated={onCreated} />)
    fillGoal()
    fireEvent.click(screen.getByRole('radio', { name: 'Streak' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add deadline' }))
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2099-12-01' } })
    const picker = await openHabitPicker()
    fireEvent.click(within(picker).getByRole('button', { name: 'Read', pressed: false }))
    expect(within(picker).getByRole('button', { name: 'Read', pressed: true })).toBeEnabled()
    fireEvent.click(within(picker).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Linked habits' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenCalledWith({ title: 'Read every day', type: 'Streak', targetValue: 12, unit: 'consecutive days', deadline: '2099-12-01', habitIds: [habit.id] })
    expect(onCreated).toHaveBeenCalledWith('created-goal')
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
