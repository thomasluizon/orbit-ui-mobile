import { formLocale, mockProfileState, dateRequests, createTags } from '@/__tests__/support/habit-form-fields'
import React from 'react'
import userEvent from '@testing-library/user-event'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildUpdateHabitRequest } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'

it('defaults an unregistered create date to account today once the profile is known', () => {
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm()
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  try {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
  } finally { vi.useRealTimers() }
})

it('blocks an unaccepted Astra date, preserves the saved date and focuses its calendar on acceptance', async () => {
  mockProfileState.aiMessagesUsed = 0
  dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
  formLocale.realDates = true
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate: '2026-10-20' } })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  try {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'habits.form.acceptDate' })).toBeVisible())
    act(() => { expect(helpers.validateAll()).toBe('habits.form.dateConfirmationRequired') })
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
    expect(dateRequests.request).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
    expect(helpers.form.getValues('datePhrase')).toBe('')
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toHaveFocus()
    expect(helpers.validateAll()).toBeNull()
  } finally { vi.useRealTimers(); formLocale.realDates = false }
})

describe('date candidate confirmation', () => {
  let helpers: HabitFormHelpers
  const saved = vi.fn()
  beforeEach(() => {
    dateRequests.request.mockReset()
    dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    saved.mockReset()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.realDates = true
    formLocale.realDateCopy = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    formLocale.realDates = false
    formLocale.realDateCopy = false
    formLocale.language = 'en'
  })
  function OwningForm() {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate: '2026-10-20' } })
    const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!await helpers.form.trigger(undefined, { shouldFocus: true }) || helpers.validateAll()) return
      const values = habitFormSchema.parse(helpers.form.getValues())
      saved([buildCreateHabitRequest(values, [], [], [], []), buildUpdateHabitRequest(values, helpers.isOneTime, '', [], [])])
    }
    return <form onSubmit={(event) => void save(event)}>
      <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
      <button type="submit">Save</button>
    </form>
  }
  function mount() {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
  }
  const phraseInput = () => screen.getByRole('textbox', { name: 'habits.form.datePhrase' })
  async function propose() {
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
  }

  it.each(['en', 'pt-BR'])('retires unresolved feedback and the paid action when a date is proposed in %s', async (locale) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    mount()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    expect(screen.getByText(messages.habits.form.datePhraseUnresolved)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(screen.queryByText(messages.habits.form.datePhraseUnresolved)).toBeNull()
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('status')).toHaveTextContent(messages.habits.form.dateProposed)
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(screen.queryByText(/^habits.form.askAstraCost/)).toBeNull()
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-20', datePhrase: 'after vacation', dateIssue: '' })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each([['en', 'Save'], ['en', 'Enter'], ['pt-BR', 'Save'], ['pt-BR', 'Enter']])('blocks an unaccepted candidate in %s through %s and focuses accurate confirmation guidance', async (locale, submission) => {
    formLocale.language = locale
    const confirmation = locale === 'en' ? 'Use the suggested date or choose another in the calendar.' : 'Use a data sugerida ou escolha outra no calendário.'
    mount()
    await propose()
    const user = userEvent.setup()
    if (submission === 'Save') await user.click(screen.getByRole('button', { name: 'Save' }))
    else { phraseInput().focus(); await user.keyboard('{Enter}') }
    expect(saved).not.toHaveBeenCalled()
    await waitFor(() => expect(phraseInput()).toHaveFocus())
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
    expect(phraseInput()).toHaveAttribute('aria-invalid', 'true')
    expect(phraseInput()).toHaveAccessibleDescription(expect.stringContaining(confirmation))
    expect(screen.queryByText(en.habits.form.datePhraseUnresolved)).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.acceptDate' })).toBeEnabled()
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it('offers another paid consultation only after the proposed phrase changes', async () => {
    mount()
    await propose()
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(screen.queryByText(/^habits.form.askAstraCost/)).toBeNull()
    fireEvent.change(phraseInput(), { target: { value: 'after my next vacation' } })
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.suggestDate' })).toBeEnabled()
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it('retains failed consultation recovery and clears manual validation after a local date edit', async () => {
    dateRequests.request.mockRejectedValueOnce(new Error('provider timeout'))
    mount()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'habits.form.suggestDate' })).toBeEnabled())
    expect(screen.getByText(en.habits.form.datePhraseUnresolved)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(saved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(en.habits.form.datePhraseUnresolved)).toBeNull()
    fireEvent.change(phraseInput(), { target: { value: 'dia 26' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(dateRequests.request).toHaveBeenCalledTimes(2)
  })

  it.each(['accept', 'same', 'different'])('saves only the owned date after %s resolves a blocked proposal', async (resolution) => {
    mount()
    await propose()
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(saved).not.toHaveBeenCalled()
    const date = resolution === 'different' ? '2026-10-27' : '2026-10-26'
    if (resolution === 'accept') fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
    else {
      fireEvent.click(screen.getByRole('button', { name: /habits.form.taskDate/ }))
      fireEvent.click(document.querySelector<HTMLButtonElement>(`button[data-day="${date}"]`)!)
    }
    if (resolution === 'accept') expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(helpers.form.getValues()).toMatchObject({ dueDate: date, datePhrase: '', dateIssue: '' })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved).toHaveBeenLastCalledWith([expect.objectContaining({ dueDate: date, title: 'Read' }), expect.objectContaining({ dueDate: date, title: 'Read' })])
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })
})
