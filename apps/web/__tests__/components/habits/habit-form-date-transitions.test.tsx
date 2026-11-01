import { formLocale, mockProfileState, dateRequests, connection, createTags } from '@/__tests__/support/habit-form-fields'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildUpdateHabitRequest } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'

describe('date ownership across form transitions', () => {
  beforeEach(() => {
    formLocale.realController = true
    dateRequests.request.mockReset()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = false
    document.documentElement.removeAttribute('style')
  })

  function mountDateForm(isFlexible = false, title = 'Read') {
    let fieldsVersion = 0
    let lockedGeneral: boolean | null = null
    let helpers!: HabitFormHelpers
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title, dueDate: '2026-10-20', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible, endDate: '2026-12-01' } })
      return <HabitFormFields key={fieldsVersion} lockedGeneral={lockedGeneral} readPhraseLocally formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    }
    const form = () => <QueryClientProvider client={client}><OwningForm /></QueryClientProvider>
    const view = render(form())
    const phrase = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value } })
    const general = () => { fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ })); fireEvent.click(screen.getByRole('radio', { name: 'habits.form.noSchedule' })) }
    const recurring = () => fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
    return { lockGeneral: () => { lockedGeneral = true; view.rerender(form()) }, values: () => helpers.form.getValues(), helpers: () => helpers, phrase, general, recurring, refresh: () => view.rerender(form()), remountFields: () => { fieldsVersion++; view.rerender(form()) } }
  }

  it.each([
    ['pt-BR', 'toda semana'], ['pt-BR', 'todas as semanas'], ['pt-BR', 'semanalmente'],
    ['en', 'every week'], ['en', 'weekly'],
  ])('routes weekly wording %s %s through the real form', (locale, phrase) => {
    formLocale.language = locale
    const owner = mountDateForm()
    owner.phrase(phrase)
    expect(owner.values().frequencyUnit).toBe('Week')
    expect(owner.values()).toMatchObject({ itemType: 'habit', frequencyQuantity: 1, isFlexible: false, days: [], intervalWeeks: 1, dueDate: '2026-10-20', endDate: '2026-12-01', title: 'Read', datePhrase: phrase, dateIssue: '' })
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(screen.getByRole('textbox', { name: 'habits.form.datePhrase' })).toHaveValue(phrase)
    expect(screen.queryByText('habits.form.datePhraseUnresolved')).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(dateRequests.request).not.toHaveBeenCalled()
    const values = habitFormSchema.parse(owner.values())
    expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
    expect(buildUpdateHabitRequest(values, false, '2026-12-01', [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
  })

  it.each([0, 5])('keeps the offline date reason accessible with %s messages used', (used) => {
    connection.isOnline = false
    mockProfileState.aiMessagesUsed = used
    const owner = mountDateForm()
    owner.phrase('after my vacation')
    expect(screen.queryAllByRole('button', { name: 'habits.form.suggestDate' })).toHaveLength(0)
    expect(dateRequests.request).not.toHaveBeenCalled()
    connection.isOnline = true
    owner.refresh()
    expect(owner.values()).toMatchObject({ datePhrase: 'after my vacation', dueDate: '2026-10-20' })
    owner.phrase('tomorrow')
    expect(owner.values().dueDate).toBe('2026-10-21')
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([false, true])('recognizes weekly wording offline at capacity with Pro access %s', (hasProAccess) => {
    connection.isOnline = false
    mockProfileState.aiMessagesUsed = 5
    mockProfileState.hasProAccess = hasProAccess
    const owner = mountDateForm()
    owner.phrase('weekly')
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-20', dateIssue: '' })
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps tomorrow calendar-only through the real form', () => {
    const owner = mountDateForm()
    owner.phrase('tomorrow')
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Day', dueDate: '2026-10-21', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('preserves the current flexible draft when an older fixed draft exists', () => {
    const owner = mountDateForm()
    act(() => {
      owner.helpers().setFlexible()
      owner.helpers().form.setValue('dueDate', '2026-10-23')
      owner.helpers().form.setValue('dueTime', '08:00')
      owner.helpers().form.setValue('reminderEnabled', true)
    })
    owner.phrase('weekly')
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Week', isFlexible: false, dueDate: '2026-10-23', dueTime: '08:00', reminderEnabled: true, endDate: '2026-12-01' })
  })

  it('recovers Task wording through the same-date manual picker', () => {
    const owner = mountDateForm()
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
    owner.phrase('weekly')
    act(() => { owner.helpers().validateAll() })
    fireEvent.click(screen.getByRole('button', { name: /habits.form.taskDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-20"]')!)
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(owner.values()).toMatchObject({ itemType: 'task', frequencyUnit: null, dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'])('retains deliberate Task with one %s recovery and real type focus', (locale) => {
    formLocale.language = locale
    const owner = mountDateForm()
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
    const input = screen.getByRole('textbox', { name: 'habits.form.datePhrase' })
    input.focus()
    owner.phrase('every week')
    expect(input).toHaveFocus()
    expect(owner.values()).toMatchObject({ itemType: 'task', frequencyUnit: null, frequencyQuantity: null, dueDate: '2026-10-20', dateIssue: 'habits.form.recurrenceRequiresHabit' })
    expect(screen.getAllByText('habits.form.recurrenceRequiresHabit')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    act(() => { expect(owner.helpers().validateAll()).toBe('habits.form.recurrenceRequiresHabit') })
    expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
    expect(screen.getByRole('radiogroup', { name: 'habits.form.itemType' })).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
    expect(owner.values()).toMatchObject({ itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-20', dateIssue: '' })
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('resolves weekly Task wording after an undated draft', () => {
    const owner = mountDateForm()
    owner.general()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.taskDate' }))
    owner.phrase('dia 23')
    owner.phrase('weekly')
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
    expect(owner.values()).toMatchObject({ itemType: 'habit', isGeneral: false, frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-23', datePhrase: 'weekly', dateIssue: '' })
    expect(buildCreateHabitRequest(habitFormSchema.parse(owner.values()), [], [], [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-23' })
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    owner.refresh()
    owner.remountFields()
    expect(owner.values()).toMatchObject({ isGeneral: false, frequencyUnit: 'Week', dueDate: '2026-10-23', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('lets later cadence and General decisions win over retained weekly wording', () => {
    const owner = mountDateForm(true)
    owner.phrase('weekly')
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    owner.refresh()
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Month', datePhrase: 'weekly', dateIssue: '', dueDate: '2026-10-20' })
    owner.general()
    owner.refresh()
    expect(owner.values()).toMatchObject({ isGeneral: true, frequencyUnit: null })
    owner.recurring()
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Month', dateIssue: '' })
    owner.phrase('')
    owner.phrase('weekly')
    expect(owner.values().frequencyUnit).toBe('Week')
    owner.phrase('tomorrow')
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Week', dueDate: '2026-10-21', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps a manual correction across field remount, account reset and validation with an old title phrase', () => {
    const owner = mountDateForm(false, 'Read every Monday')
    owner.phrase('weekly')
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    owner.remountFields()
    advanceAccountGeneration()
    owner.refresh()
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Month', datePhrase: 'weekly', dateIssue: '', dueDate: '2026-10-20' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps manual cadence after manual date clears weekly wording and fields reopen', () => {
    const owner = mountDateForm(false, 'Read every Monday')
    owner.phrase('weekly')
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    fireEvent.click(screen.getByRole('button', { name: /habits.form.habitStartDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-23"]')!)
    expect(owner.values().datePhrase).toBe('')
    owner.remountFields()
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Month', dueDate: '2026-10-23', datePhrase: '', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('retires a pending date consultation when weekly wording is handled', async () => {
    let finish!: (value: { date: string; referenceDate: string }) => void
    const response = { date: '2026-10-26', referenceDate: '2026-10-20' }
    dateRequests.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const owner = mountDateForm()
    owner.phrase('after vacation')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    owner.phrase('weekly')
    await act(async () => { finish(response) })
    expect(owner.values()).toMatchObject({ frequencyUnit: 'Week', dueDate: '2026-10-20', dateIssue: '' })
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.suggestDate' })).toBeNull()
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each([false, true])('clears the persisted end date in a real task conversion, flexible: %s', (flexible) => {
    const owner = mountDateForm(flexible)
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
    expect(owner.values()).toMatchObject({ endDate: '', frequencyUnit: null, isFlexible: false, itemType: 'task' })
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    const request = buildUpdateHabitRequest(habitFormSchema.parse(owner.values()), owner.helpers().isOneTime, '2026-12-01', [], [])
    expect(request).toMatchObject({ clearEndDate: true, dueDate: '2026-10-20' })
    expect(request).not.toHaveProperty('endDate')
    expect(request).not.toHaveProperty('startDate')
    expect(request.frequencyUnit).toBeUndefined()
  })

  it.each(['after my vacation', '31 February', '03-04'])('restores parse recovery after General for %s without consulting', (phrase) => {
    const owner = mountDateForm()
    owner.phrase(phrase)
    owner.general()
    expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
    owner.recurring()
    expect(owner.values().datePhrase).toBe(phrase)
    expect(screen.getByRole('button', { name: /habits.form.habitStartDate/ })).toBeEnabled()
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['day', 'timezone', 'locale', 'account'] as const)('requires manual confirmation after General and changed %s', (change) => {
    const owner = mountDateForm()
    owner.phrase('tomorrow')
    expect(owner.values().dueDate).toBe('2026-10-21')
    owner.general()
    if (change === 'day') vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    if (change === 'timezone') mockProfileState.timeZone = 'America/Sao_Paulo'
    if (change === 'locale') formLocale.language = 'pt-BR'
    if (change === 'account') advanceAccountGeneration()
    owner.refresh()
    owner.recurring()
    expect(owner.values()).toMatchObject({ datePhrase: 'tomorrow', dueDate: '2026-10-21', dateIssue: 'habits.form.dateStale' })
    act(() => { expect(owner.helpers().validateAll()).toBe('habits.form.dateStale') })
    fireEvent.click(screen.getByRole('button', { name: /habits.form.habitStartDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-21"]')!)
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(owner.values()).toMatchObject({ datePhrase: '', dateIssue: '', dueDate: '2026-10-21' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  function changeCadence(change: string, owner: ReturnType<typeof mountDateForm>) {
    if (change === 'unit') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitWeek' }))
    if (change === 'quantity') fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '2' } })
    if (change === 'days') fireEvent.click(screen.getByRole('button', { name: owner.helpers().daysList[0]!.accessibleLabel }))
    if (change === 'interval') fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    if (change === 'flexible') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    if (change === 'general') { owner.general(); owner.recurring() }
  }

  it.each(['unit', 'quantity', 'days', 'interval', 'flexible', 'general'])('retires the delayed response after %s changes', async (change) => {
    let finish!: (value: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const owner = mountDateForm()
    owner.phrase('after my vacation')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    changeCadence(change, owner)
    await act(async () => { finish({ date: '2026-10-26', referenceDate: '2026-10-20' }) })
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(owner.values()).toMatchObject({ dueDate: '2026-10-20', datePhrase: 'after my vacation' })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

})
