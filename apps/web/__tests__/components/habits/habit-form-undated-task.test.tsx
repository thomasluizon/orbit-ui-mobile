import { setupHabitModalSubmit, formLocale, createTags, modalFeedback } from '@/__tests__/support/habit-form-fields'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useUIStore } from '@/stores/ui-store'

afterEach(async () => { await act(() => useUIStore.setState({ activeView: 'today' })) })

describe.each(['create', 'edit'] as const)('%s task date choices', (owner) => {
  const { mount, submit, mutation } = setupHabitModalSubmit(owner)

  if (owner === 'create') it.each(['en', 'pt-BR'])('opens from General as an undated task in %s', async (locale) => {
    formLocale.language = locale
    formLocale.realController = true
    useUIStore.setState({ activeView: 'general' })
    await mount(null)
    expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'habits.form.noSchedule' })).toBeChecked()
    expect(screen.queryByRole('radiogroup', { name: 'habits.form.frequency' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    expect(mutation().mock.calls[0]![0]).toMatchObject({ title: 'Read', isGeneral: true })
    for (const field of ['dueDate', 'startDate', 'frequencyUnit', 'frequencyQuantity']) expect(mutation().mock.calls[0]![0]).not.toHaveProperty(field)
  })

  it.each(['en', 'pt-BR'])('saves a task without a date in %s', async (locale) => {
    formLocale.language = locale
    await mount('task')
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.noSchedule' }))
    expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
    expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = owner === 'create' ? mutation().mock.calls[0]![0] : mutation().mock.calls[0]![0].data
    expect(request).toMatchObject({ title: 'Read', isGeneral: true })
    for (const field of ['dueDate', 'startDate', 'frequencyUnit', 'frequencyQuantity']) expect(request).not.toHaveProperty(field)
  })

  it('returns from no date to a dated task', async () => {
    await mount('task')
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.noSchedule' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.taskDate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'tomorrow' } })
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = owner === 'create' ? mutation().mock.calls[0]![0] : mutation().mock.calls[0]![0].data
    expect(request).toMatchObject({ dueDate: '2026-10-21' })
    expect(request.isGeneral ?? false).toBe(false)
    expect(request.frequencyUnit).toBeUndefined()
  })

  it('offers exactly two habit frequencies', async () => {
    await mount('habit')
    const frequency = screen.getByRole('radiogroup', { name: 'habits.form.frequency' })
    expect(within(frequency).getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByRole('radio', { name: 'habits.form.noSchedule' })).toBeNull()
  })

  if (owner === 'edit') it.each(['unchanged', 'dated', 'habit'] as const)('opens a General item as an undated task and saves %s', async (transition) => {
    const habit = createMockHabit({ title: 'Read', isGeneral: true, frequencyUnit: null, frequencyQuantity: null, dueDate: '', startDate: undefined })
    render(<QueryClientProvider client={new QueryClient()}><EditHabitModal open onOpenChange={vi.fn()} habit={habit} /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: 'habits.form.noSchedule' })).toBeChecked()
    if (transition === 'dated') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.taskDate' }))
    if (transition === 'habit') fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
    if (transition !== 'unchanged') fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'tomorrow' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })) })
    await waitFor(() => expect(modalFeedback.update).toHaveBeenCalledOnce())
    const request = modalFeedback.update.mock.calls[0]![0].data
    expect(request.isGeneral).toBe(transition === 'unchanged')
    if (transition === 'dated') expect(request.dueDate).toBe('2026-10-21')
    if (transition === 'habit') expect(request).toMatchObject({ startDate: '2026-10-21', frequencyUnit: 'Day', frequencyQuantity: 1 })
  })
})

it('keeps a General child locked to an undated task', () => {
  formLocale.realController = true
  function OwningForm() {
    const helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', isGeneral: true } })
    return <HabitFormFields lockedGeneral formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
  expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
  expect(screen.getByRole('radio', { name: /^habits.form.typeHabit/ })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('radio', { name: 'habits.form.noSchedule' })).toBeChecked()
  expect(screen.getByRole('radio', { name: /^habits.form.taskDate/ })).toHaveAttribute('aria-disabled', 'true')
})
