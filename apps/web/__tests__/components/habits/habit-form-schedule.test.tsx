import { formLocale, mockProfileState, SETUP_PROPOSAL, createFormHelpers, createTags, renderForm } from '@/__tests__/support/habit-form-fields'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildUpdateHabitRequest, buildHabitFormPatchFromSuggestion } from '@orbit/shared/utils'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'

describe('visible cadence choices and corrections', () => {
  it('shows only days for a parsed fixed schedule', () => {
    renderForm(createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.getByRole('radiogroup', { name: 'habits.form.frequency' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Monday' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'habits.form.moreOften' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.repeatMore' })).toBeEnabled()
  })

  it.each([
    { title: 'Run 3 times a week', isFlexible: true, frequencyUnit: 'Week', frequencyQuantity: 3 },
    { title: 'Run', isFlexible: false, frequencyUnit: null, frequencyQuantity: null },
  ])('offers day and count corrections for $title', (values) => {
    const formHelpers = createFormHelpers(values)
    renderForm(formHelpers)
    expect(screen.getByRole('radiogroup', { name: 'habits.form.frequency' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalled()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' }) !== null).toBe(Boolean(values.frequencyUnit))
  })
})

describe('cadence correction transitions', () => {
  it('returns to a weekly target when the last selected day is cleared', () => {
    const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
    renderForm(formHelpers)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 3, { shouldDirty: true })
  })

  it('keeps repeat intervals beside the visible frequency', () => {
    const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
    renderForm(formHelpers)
    expect(screen.getByRole('button', { name: 'habits.form.repeatMore' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('intervalWeeks', 2, { shouldDirty: true })
  })
})

describe('manual schedule creation', () => {
  beforeEach(() => {
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
  })
  it.each(['Day', 'Week', 'Month', 'Year'] as const)('creates every interval and flexible %s schedule without Astra', async (unit) => {
    mockProfileState.aiMessagesUsed = 5
    const ask = vi.fn()
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2026-09-02' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={ask} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.every' }))
    fireEvent.click(screen.getByRole('radio', { name: `habits.form.unit${unit}` }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '12' } })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: false, days: [] })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, intervalWeeks: 2 })
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: true, days: [] })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '0' } })
    expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription('habits.form.frequencyRequired')
    expect(helpers.validateAll()).toBe('habits.form.frequencyRequired')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    expect(helpers.validateAll()).toBeNull()
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    fireEvent.change(screen.getByLabelText(/habits.form.(?:taskDescribe|describe)/), { target: { value: 'Read books' } })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    expect(ask).not.toHaveBeenCalled()
  })

  it.each(['quantity', 'unit', 'mode', 'day', 'interval'] as const)('marks an Astra schedule as proposed until a %s edit', async (edit) => {
    const patch = buildHabitFormPatchFromSuggestion({ emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2099-01-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => ({ ...SETUP_PROPOSAL, setup: applySuggestionSchedule(patch, helpers) })} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    expect(view.container.querySelector('[data-proposed]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(helpers.form.getValues('days')).toEqual(['Monday']))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    const quantity = screen.getByRole('spinbutton', { name: 'habits.form.frequency' })
    for (const control of [quantity, screen.getByRole('radio', { name: 'habits.form.every' }), screen.getByRole('radio', { name: 'habits.form.unitDay' }), screen.getByRole('button', { name: helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel })]) {
      expect(control.closest('[data-proposed]')).not.toBeNull()
    }
    expect(quantity).toHaveValue(1)
    expect((quantity as HTMLInputElement).style.color).toBe('var(--fg-3)')
    expect(screen.getByRole('button', { name: helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }).closest('[data-proposed]')).toBeNull()
    quantity.focus()
    if (edit === 'quantity') fireEvent.change(quantity, { target: { value: '2' } })
    else if (edit === 'unit') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    else if (edit === 'mode') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    else fireEvent.click(screen.getByRole('button', { name: edit === 'day' ? helpers.daysList.find((day) => day.value === 'Tuesday')!.accessibleLabel : 'habits.form.repeatMore' }))
    expect(view.container.querySelector('[data-proposed]')).toBeNull()
    if (edit === 'quantity') {
      expect(screen.getByRole('spinbutton')).toBe(quantity)
      expect(quantity).toHaveFocus()
      expect(quantity).toHaveValue(2)
      expect((quantity as HTMLInputElement).style.color).toBe('var(--fg-1)')
    }
    expect(helpers.form.getValues('title')).toBe('Read')
  })

  it('disables manual scheduling for a locked parent', () => {
    renderForm(createFormHelpers({ title: 'Read', isGeneral: true }), undefined, true, false, true)
    expect(screen.getByRole('radio', { name: /habits.form.every/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: /habits.form.unitMonth/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('spinbutton', { name: 'habits.form.frequency' })).toBeDisabled()
  })
})

describe('habit end time', () => {
  function EditingForm({ onSave }: { onSave: (requests: unknown[]) => void }) {
    const helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Run', dueDate: '2099-01-01' } })
    const save = () => {
      if (helpers.validateAll()) return
      const values = habitFormSchema.parse(helpers.form.getValues())
      onSave([buildCreateHabitRequest(values, [], [], [], []), buildUpdateHabitRequest(values, true, '', [], [])])
    }
    return <><HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} /><button onClick={() => helpers.form.reset({ ...helpers.form.getValues(), dueTime: '08:00', dueEndTime: '09:00' })}>load existing times</button><button onClick={() => helpers.form.reset({ ...helpers.form.getValues(), dueTime: '' })}>remove start elsewhere</button><button onClick={save}>save times</button></>
  }

  it('edits and clears end times, rejects ordering errors, and hides the field without a start', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSave = vi.fn()
    render(<QueryClientProvider client={client}><EditingForm onSave={onSave} /></QueryClientProvider>)
    const openTiming = () => fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))
    const closeTiming = () => fireEvent.click(screen.getByRole('button', { name: 'common.done' }))
    const start = () => screen.getByLabelText('habits.form.exactTime')
    const end = () => screen.getByLabelText('habits.form.dueEndTime')
    openTiming()
    expect(screen.queryByLabelText('habits.form.dueEndTime')).toBeNull()
    fireEvent.change(start(), { target: { value: '08:00' } })
    expect(end()).toBeEnabled()
    fireEvent.change(end(), { target: { value: '09:00' } })
    fireEvent.blur(end())
    closeTiming()
    fireEvent.click(screen.getByRole('button', { name: 'save times' }))
    expect(onSave).toHaveBeenLastCalledWith([expect.objectContaining({ dueTime: '08:00', dueEndTime: '09:00' }), expect.objectContaining({ dueTime: '08:00', dueEndTime: '09:00' })])
    onSave.mockClear()
    openTiming()
    fireEvent.change(end(), { target: { value: '08:00' } })
    fireEvent.blur(end())
    expect(end()).toHaveAttribute('aria-invalid', 'true')
    expect(end()).toHaveAccessibleDescription('habits.form.endTimeBeforeStartTime')
    closeTiming()
    fireEvent.click(screen.getByRole('button', { name: 'save times' }))
    expect(onSave).not.toHaveBeenCalled()
    openTiming()
    fireEvent.change(end(), { target: { value: '07:00' } })
    fireEvent.blur(end())
    expect(end()).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(end(), { target: { value: '10:00' } })
    fireEvent.blur(end())
    expect(end()).not.toHaveAttribute('aria-invalid')
    fireEvent.click(within(end().parentElement!).getByRole('button', { name: 'common.clear' }))
    expect(end()).toHaveValue('')
    fireEvent.click(within(start().parentElement!).getByRole('button', { name: 'common.clear' }))
    expect(screen.queryByLabelText('habits.form.dueEndTime')).toBeNull()
    closeTiming()
    fireEvent.click(screen.getByRole('button', { name: 'load existing times' }))
    openTiming()
    expect(end()).toHaveValue('09:00')
    closeTiming()
    fireEvent.click(screen.getByRole('button', { name: 'remove start elsewhere' }))
    openTiming()
    await waitFor(() => expect(screen.queryByLabelText('habits.form.dueEndTime')).toBeNull())
  })
})

describe('restored end-date control', () => {
  it.each([false, true])('clears the selected end date through the existing update request, flexible: %s', (isFlexible) => {
    formLocale.realDates = true
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Run', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible, endDate: '2026-11-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.removeEndDate' }))
    const request = buildUpdateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), false, '2026-11-01', [], [])
    expect(request.clearEndDate).toBe(true)
    expect(request.endDate).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'habits.form.removeEndDate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.endDate, common.selectDate' })).toHaveFocus()
    view.unmount()
    formLocale.realDates = false
  })

  it('keeps the remove action absent until an end date is selected', () => {
    renderForm(createFormHelpers(), undefined, true)
    expect(screen.queryByRole('button', { name: 'habits.form.removeEndDate' })).toBeNull()
  })
})

describe('restored type and editable date', () => {
  it('offers an explicit task choice before the title', () => {
    renderForm(createFormHelpers(), undefined, false)
    const task = screen.getByRole('radio', { name: /^habits.form.typeTask/ })
    expect(task.compareDocumentPosition(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('offers the editable task date with details closed', () => {
    formLocale.realDates = true
    renderForm(createFormHelpers({ itemType: 'task' }), undefined, false)
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toBeVisible()
    formLocale.realDates = false
  })
})

describe('type and date owning form workflow', () => {
  it('preserves dated and undated task drafts alongside habit schedules', () => {
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { dueDate: '2026-10-20' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />
    }
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }), { target: { value: 'migrar chats do ChatGPT para o Claude' } })
    act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
    try {
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'dia 26' } })
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
      expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ title: 'migrar chats do ChatGPT para o Claude', dueDate: '2026-10-26' })
      fireEvent.change(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }), { target: { value: 'Read every Monday' } })
      expect(helpers.form.getValues('itemType')).toBe('task')
      expect(helpers.form.getValues('frequencyUnit')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Monday' })).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'dia 28' } })
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
      fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.noSchedule' }))
      expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ isGeneral: true })
      expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
      expect(screen.queryByRole('switch', { name: 'habits.form.habitTypeAvoid' })).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
      expect(helpers.form.getValues('isGeneral')).toBe(false)
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-28')
      fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeTask/ }))
      expect(helpers.form.getValues()).toMatchObject({ isGeneral: true, dueDate: '' })
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.taskDate' }))
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
      expect(helpers.form.getValues('datePhrase')).toBe('dia 26')
    } finally { vi.useRealTimers() }
  })
})
