import { setupHabitModalSubmit, formLocale, mockProfileState, modalFeedback, dateRequests } from '@/__tests__/support/habit-form-fields'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const repeatPhraseCases = [
  { wording: "every day", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "daily", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "once a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "twice a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 2, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "3x a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 3, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every Monday", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "weekdays", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "todo dia", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "todos os dias", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "uma vez por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "duas vezes por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 2, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "3x por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 3, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "toda segunda", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "dias úteis", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "toda semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every Monday from next week", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-26"} },
  { wording: "toda segunda a partir da próxima semana", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-26"} }
]

describe.each(['create', 'edit'] as const)('actual %s modal submit feedback', (owner) => {
  const { phraseInput, mutation, mount, submit } = setupHabitModalSubmit(owner)

  it.each(['en', 'pt-BR'])('saves the entered cadence with an automatically filled Astra start in %s', async (locale) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    fireEvent.change(phraseInput(), { target: { value: 'every Monday from after vacation' } })
    await screen.findByRole('status', { name: 'habits.form.dateInterpreted' })
    expect(phraseInput()).toHaveValue('every Monday from after vacation')
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-26' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each(['en', 'pt-BR'])('blocks an unapplied explicit start after profile loading until reread in %s', async (locale) => {
    formLocale.realController = true
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    const view = await mount('habit')
    fireEvent.change(phraseInput(), { target: { value: 'every Monday from next week' } })
    mockProfileState.timeZone = 'UTC'
    view.refresh()
    await submit()
    expect(mutation()).not.toHaveBeenCalled()
    expect(phraseInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText((locale === 'en' ? en : ptBR).habits.form.datePhraseUnresolved)).toBeVisible()
    expect(screen.getByRole('button', { name: /habits.form.habitStartDate/ })).toBeEnabled()
    fireEvent.change(phraseInput(), { target: { value: 'every Monday from next week ' } })
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-26' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  if (owner === 'create') it('keeps weekly wording behind the required explicit type choice', async () => {
    formLocale.realController = true
    await mount(null)
    fireEvent.change(phraseInput(), { target: { value: 'weekly' } })
    await submit()
    expect(screen.getByText('habits.form.typeRequired')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toHaveFocus()
    expect(mutation()).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeHabit' }))
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    expect(mutation()).toHaveBeenCalledWith(expect.objectContaining({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' }))
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([
    ['pt-BR', 'toda semana'], ['pt-BR', 'todas as semanas'], ['pt-BR', 'semanalmente'],
    ['en', 'every week'], ['en', 'weekly'],
  ])('saves locally routed weekly wording %s %s only on ordinary Submit', async (locale, wording) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    fireEvent.change(phraseInput(), { target: { value: wording } })
    expect(phraseInput()).toHaveValue(wording)
    expect(screen.getByRole('radio', { name: 'habits.form.typeHabit' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(mutation()).not.toHaveBeenCalled()
    expect(dateRequests.request).not.toHaveBeenCalled()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ title: 'Read', frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'].flatMap((locale) => repeatPhraseCases.map((phrase) => ({ locale, ...phrase }))))('saves repeat phrase $locale $wording through the actual modal', async ({ locale, wording, expected }) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    fireEvent.change(phraseInput(), { target: { value: wording } })
    if (owner === 'create') fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(screen.getByRole('radio', { name: expected.isFlexible ? 'habits.form.timesPerUnit' : 'habits.form.every' })).toBeChecked()
    expect(screen.getByRole('radio', { name: expected.frequencyUnit === 'Week' ? 'habits.form.unitWeek' : 'habits.form.unitDay' })).toBeChecked()
    expect(screen.getByRole('spinbutton', { name: 'habits.form.frequency' })).toHaveValue(expected.frequencyQuantity)
    for (const day of expected.days) expect(screen.getByRole('button', { name: `dates.daysLong.${day.toLowerCase()}` })).toHaveAttribute('aria-pressed', 'true')
    expect(mutation()).not.toHaveBeenCalled()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const { dueDate, days, isFlexible, ...schedule } = expected
    const request = expect.objectContaining({ ...schedule, ...(days.length ? { days } : {}), ...(isFlexible || owner === 'edit' ? { isFlexible } : {}), title: 'Read', startDate: dueDate })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })
})
