import { formLocale, mockProfileState, dateRequests, connection, createTags } from '@/__tests__/support/habit-form-fields'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { habitFormSchema } from '@orbit/shared/validation'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { buildCreateHabitRequest, buildUpdateHabitRequest, formatLocaleDate } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'

beforeEach(() => {
  dateRequests.request.mockReset().mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
  mockProfileState.aiMessagesUsed = 0
  mockProfileState.timeZone = 'UTC'
  formLocale.realDates = true
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] })
})
afterEach(() => { vi.useRealTimers(); formLocale.realDates = false; formLocale.language = 'en'; connection.isOnline = true })

function mount(dueDate = '2026-10-20') {
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate } })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  const client = new QueryClient()
  const composition = () => <QueryClientProvider client={client}><OwningForm /></QueryClientProvider>
  const view = render(composition())
  return { helpers, ...view, refreshProfile: () => view.rerender(composition()) }
}
const phrase = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value } })
const debounce = () => act(async () => { await vi.advanceTimersByTimeAsync(700) })
const calendar = () => screen.getByRole('button', { name: /habits.form.taskDate/ })

describe('automatic date field', () => {
  it.each(['en', 'pt-BR'])('interprets non-local wording when the profile arrives after typing in %s', async (locale) => {
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    const { helpers, refreshProfile } = mount('')
    const wording = locale === 'en' ? 'next holiday' : 'no próximo feriado'
    phrase(wording)
    await debounce()
    expect(helpers.form.getValues('dueDate')).toBe('')
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(screen.getByText('habits.form.datePhraseUnresolved')).toBeVisible()
    mockProfileState.timeZone = 'UTC'
    refreshProfile()
    await debounce()
    await debounce()
    expect(dateRequests.request).toHaveBeenCalledOnce()
    expect(dateRequests.request).toHaveBeenCalledWith(expect.objectContaining({ phrase: wording, language: locale }))
    expect(calendar()).toHaveTextContent(formatLocaleDate('2026-10-26', locale))
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-26', datePhrase: wording, dateIssue: '' })
    expect(helpers.validateAll()).toBeNull()
    expect(screen.queryByText('habits.form.datePhraseUnresolved')).toBeNull()
    expect(screen.queryByText('habits.form.dateStale')).toBeNull()
    expect(screen.getByRole('status', { name: 'habits.form.dateInterpreted' })).toBeVisible()
  })

  it.each(['en', 'pt-BR'])('retains the phrase date when the profile arrives after typing in %s', async (locale) => {
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'))
    const { helpers, refreshProfile } = mount('')
    phrase(locale === 'en' ? 'on the 26th' : 'dia 26')
    expect(helpers.form.getValues('dueDate')).toBe('')
    mockProfileState.timeZone = 'UTC'
    refreshProfile()
    await debounce()
    expect(calendar()).toHaveTextContent(formatLocaleDate('2026-09-26', locale))
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-09-26', dateIssue: '' })
    expect(helpers.validateAll()).toBeNull()
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: 'habits.form.dateInterpreted' })).toBeNull()
  })

  it.each(['en', 'pt-BR'])('fills an editable date through Astra with a subtle in-field glyph in %s', async (locale) => {
    formLocale.language = locale
    let finish!: (reply: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { helpers } = mount()
    phrase(locale === 'en' ? 'next holiday' : 'no próximo feriado')
    await debounce()
    const pending = screen.getByRole('status', { name: 'habits.form.dateInterpreting' })
    expect(pending.closest('[data-input-root]')).toContainElement(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }))
    expect(pending.querySelector('[data-asset="astra-mark"]')).toHaveAttribute('color', 'var(--fg-3)')
    await act(async () => finish({ date: '2026-10-26', referenceDate: '2026-10-20' }))
    expect(calendar()).toHaveTextContent(formatLocaleDate('2026-10-26', locale))
    expect(screen.getByRole('status', { name: 'habits.form.dateInterpreted' })).toBeVisible()
    expect(helpers.validateAll()).toBeNull()
    const values = habitFormSchema.parse(helpers.form.getValues())
    expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ dueDate: '2026-10-26' })
    expect(buildUpdateHabitRequest(values, true, '', [], [])).toMatchObject({ dueDate: '2026-10-26' })
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(screen.queryByText(/^habits.form.askAstraCost/)).toBeNull()
    fireEvent.click(calendar())
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-27"]')!)
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-27', datePhrase: '', dateIssue: '' })
    expect(screen.queryByRole('status', { name: 'habits.form.dateInterpreted' })).toBeNull()
  })

  it.each(['segunda', 'segunda-feira', 'seg', 'próxima segunda', 'monday', 'mon', 'next monday'])('uses the next Monday offline for %s, including on Monday', (wording) => {
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'))
    connection.isOnline = false
    const { helpers } = mount()
    phrase(wording)
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'task', dueDate: '2026-11-02', dateIssue: '' })
    expect(calendar()).toHaveTextContent(formatLocaleDate('2026-11-02', 'en'))
    expect(helpers.validateAll()).toBeNull()
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['toda segunda', 'every Monday'])('keeps the Habit hint for %s', async (wording) => {
    const { helpers } = mount()
    phrase(wording)
    await debounce()
    expect(helpers.form.getValues('dateIssue')).toBe('habits.form.recurrenceRequiresHabit')
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([[false, 0], [true, 5]] as const)('keeps unresolved guidance and the manual calendar when online=%s and used=%s', async (online, used) => {
    connection.isOnline = online
    mockProfileState.aiMessagesUsed = used
    const { helpers } = mount()
    phrase('next holiday')
    await debounce()
    expect(helpers.form.getValues('dateIssue')).toBe('habits.form.datePhraseUnresolved')
    expect(calendar()).toBeEnabled()
    expect(dateRequests.request).not.toHaveBeenCalled()
    phrase('amanhã')
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    phrase('dia 3')
    expect(helpers.form.getValues('dueDate')).toBe('2026-11-03')
  })

  it('debounces and cancels an obsolete response after more typing', async () => {
    let finish!: (reply: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { helpers } = mount()
    phrase('next')
    await act(async () => { await vi.advanceTimersByTimeAsync(699) })
    phrase('next holiday')
    await debounce()
    expect(dateRequests.request).toHaveBeenCalledOnce()
    const signal = dateRequests.request.mock.calls[0]![0].signal as AbortSignal
    phrase('tomorrow')
    expect(signal.aborted).toBe(true)
    await act(async () => finish({ date: '2026-10-26', referenceDate: '2026-10-20' }))
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    expect(screen.queryByRole('status', { name: 'habits.form.dateInterpreted' })).toBeNull()
  })
})
