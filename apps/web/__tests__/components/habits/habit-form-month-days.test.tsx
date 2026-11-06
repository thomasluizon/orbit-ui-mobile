import { formLocale, mockProfileState, createTags } from '@/__tests__/support/habit-form-fields'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildEditHabitFormState, buildUpdateHabitRequest } from '@orbit/shared/utils'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import type { HabitFormData } from '@orbit/shared/validation'

function renderOwningForm(initialData: Partial<HabitFormData>) {
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm({ initialData })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
  return () => helpers
}

const question = 'habits.form.monthDaysQuestion'

function monthDayGrid() {
  return within(screen.getByRole('group', { name: question }))
}

describe('the month-day question in the habit form', () => {
  beforeEach(() => {
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
  })

  it('saves monthDays [8, 15] from "todo dia 8 e dia 15 do mês"', () => {
    formLocale.language = 'pt-BR'
    const helpers = renderOwningForm({ itemType: 'habit', title: '', dueDate: '2026-11-05' })
    fireEvent.change(screen.getByLabelText(/habits.form.describe/), { target: { value: 'Pagar o cartão todo dia 8 e dia 15 do mês' } })
    expect(helpers().form.getValues()).toMatchObject({ frequencyUnit: 'Month', frequencyQuantity: 1, monthDays: [8, 15], days: [] })
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers().form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: 'Month', frequencyQuantity: 1, monthDays: [8, 15] })
    const days = monthDayGrid()
    expect(days.getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true')
    expect(days.getByRole('button', { name: '15' })).toHaveAttribute('aria-pressed', 'true')
    expect(days.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('asks the question only under a monthly fixed schedule and defaults to the start date day', () => {
    const helpers = renderOwningForm({ itemType: 'habit', title: 'Pay rent', dueDate: '2026-09-02' })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.every' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitWeek' }))
    expect(screen.queryByRole('group', { name: question })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    const days = monthDayGrid()
    expect(days.getAllByRole('button')).toHaveLength(31)
    expect(days.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true')
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers().form.getValues()), [], [], [], [])).not.toHaveProperty('monthDays')

    fireEvent.click(days.getByRole('button', { name: '15' }))
    expect(helpers().form.getValues('monthDays')).toEqual([2, 15])
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers().form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: 'Month', monthDays: [2, 15] })

    fireEvent.click(days.getByRole('button', { name: '31' }))
    expect(screen.getByText('habits.form.monthDaysShortMonth')).toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    expect(screen.queryByRole('group', { name: question })).toBeNull()
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers().form.getValues()), [], [], [], [])).not.toHaveProperty('monthDays')
  })

  it('edits stored month days and clears them back to the start date day', () => {
    const habit = createMockHabit({ frequencyUnit: 'Month', frequencyQuantity: 1, days: [], monthDays: [8, 15], startDate: '2026-11-08' })
    const helpers = renderOwningForm(buildEditHabitFormState(habit).formValues)
    const days = monthDayGrid()
    expect(days.getByRole('button', { name: '15' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(days.getByRole('button', { name: '15' }))
    expect(helpers().form.getValues('monthDays')).toEqual([])
    expect(days.getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true')
    expect(buildUpdateHabitRequest(habitFormSchema.parse(helpers().form.getValues()), false, '', [], [])).toMatchObject({ frequencyUnit: 'Month', monthDays: [] })
  })
})
