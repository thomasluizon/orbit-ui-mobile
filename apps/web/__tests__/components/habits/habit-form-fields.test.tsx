import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest } from '@orbit/shared/utils'
import { dateInterpretationSchema } from '@orbit/shared/types/habit'
import { formLocale, mockProfileState, mockRouterPush, setupPatch, SETUP_PROPOSAL, CHECKLIST_PROPOSAL, SUB_HABIT_PROPOSAL, COMBINED_PROPOSAL, dateRequests, createFormHelpers, createTags, renderForm } from '@/__tests__/support/habit-form-fields'
import userEvent from '@testing-library/user-event'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RepeatReminderSection } from '@/components/habits/habit-form-fields/repeat-reminder-section'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'

describe('HabitFormFields', () => {
  it('keeps the frequency fill action mounted with one spinner during its request', () => {
    const view = renderForm(createFormHelpers({ title: 'Build a stronger routine' }), vi.fn(() => SETUP_PROPOSAL))
    const action = screen.getByRole('button', { name: 'habits.form.askAstra' })
    expect(action.querySelector('[data-asset^="astra-mark"]')).toBeInTheDocument()
    view.rerenderForm(true)
    expect(screen.getByRole('button', { name: 'habits.form.askAstra' })).toBe(action)
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(action).toHaveAttribute('data-borderless', 'true')
    expect(action.querySelector('[data-asset^="astra-mark"]')).toBeNull()
    expect(action.querySelectorAll('svg')).toHaveLength(1)
    view.rerenderForm()
    expect(action).not.toHaveAttribute('aria-busy')
    expect(action.querySelector('[data-asset^="astra-mark"]')).toBeInTheDocument()
  })

  it('renders every form Astra action without visible text', () => {
    const helpers = createFormHelpers({ itemType: 'habit', title: 'Build a stronger routine', datePhrase: 'after my vacation' })
    const view = renderForm(helpers, vi.fn(() => SETUP_PROPOSAL), false, false, null, undefined, { onSuggestEmoji: vi.fn() })
    const actions = [...view.container.querySelectorAll('button')].filter(button => button.querySelector('[data-asset^="astra-mark"]'))
    expect(actions).toHaveLength(2)
    for (const action of actions) {
      expect(action.textContent).toBe('')
      expect(action).toHaveAccessibleName()
      expect(action.style.width).toBe('48px')
    }
  })

  it.each(['en', 'pt-BR'])('keeps natural date guidance and a single selected date in %s', (locale) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    renderForm(createFormHelpers({ itemType: 'task' }))
    expect(screen.getByRole('textbox', { name: 'habits.form.datePhrase' })).toHaveAttribute('placeholder', messages.habits.form.datePhrasePlaceholder)
    expect(screen.queryByText(/^common.selectedDate/)).toBeNull()
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps one full description directly after the name with details open %s', (expanded) => {
    const description = 'Long description\n'.repeat(500)
    const helpers = createFormHelpers({ title: 'Read', description })
    renderForm(helpers, undefined, expanded)
    const fields = screen.getAllByRole('textbox')
    expect(fields[0]).toHaveAccessibleName('habits.form.describe')
    expect(fields[1]).toHaveAccessibleName('habits.form.description')
    expect(fields[1]).toHaveValue(description)
    expect(fields[1]).toHaveAttribute('maxlength', '10000')
    expect(screen.getAllByRole('textbox', { name: 'habits.form.description' })).toHaveLength(1)
    fireEvent.change(fields[1]!, { target: { value: 'Edited description' } })
    expect(helpers.form.getValues('description')).toBe('Edited description')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    formLocale.language = 'en'
    formLocale.realReminders = false
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
  })

  it('omits an empty sub-habit section when the edit form supplies no editor', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded /></QueryClientProvider>)
    expect(screen.queryByText('habits.form.subHabits')).toBeNull()
  })

  it.each([false, true])('keeps the sub-habit editor available with Pro access %s', (hasProAccess) => {
    mockProfileState.hasProAccess = hasProAccess
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)
    expect(screen.queryByText('sub-habit-editor')).toBeTruthy()
    expect(screen.getByText('goal-linking')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /common\.upgrade/ }) !== null).toBe(false)
  })

  it.each(['', '   ', 'Swim'])('reaches the emoji action without replacing setup for title %j', async (title) => {
    const onSuggestEmoji = vi.fn().mockResolvedValue(SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title }), undefined, false, false, null, undefined, { onSuggestEmoji })
    const button = screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
    expect(button.hasAttribute('disabled')).toBe(!title.trim())
    if (title.trim()) {
      const user = userEvent.setup()
      button.focus()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')
    } else fireEvent.click(button)
    await waitFor(() => expect(onSuggestEmoji).toHaveBeenCalledTimes(title.trim() ? 1 : 0))
    if (!title.trim()) {
      expect(button).toHaveAccessibleDescription('habits.form.titleRequired')
      expect(screen.getByText('habits.form.titleRequired')).not.toBeVisible()
    }
  })

  it.each([false, true])('preserves the emoji action through pending and success after moving focus: %j', async (moveFocus) => {
    let complete!: (proposal: HabitFormProposal) => void
    const pending = new Promise<HabitFormProposal>((resolve) => { complete = resolve })
    const onSuggestEmoji = vi.fn(() => pending)
    const emojiOptions = { onSuggestEmoji, isEmojiSuggesting: false }
    const view = renderForm(createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 }), undefined, false, false, null, undefined, emojiOptions)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
    button.focus()
    await user.keyboard('{Enter}')
    emojiOptions.isEmojiSuggesting = true
    view.rerenderForm(true)
    const busy = screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
    expect(busy).toBe(button)
    expect(busy.querySelector('[data-asset^="astra-mark"]')).toBeNull()
    expect(busy.querySelectorAll('svg')).toHaveLength(1)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).not.toBeDisabled()
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter} ')
    fireEvent.click(busy)
    expect(onSuggestEmoji).toHaveBeenCalledOnce()
    const phrase = screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ })
    if (moveFocus) await user.click(phrase)
    await act(async () => { complete(SETUP_PROPOSAL); await pending })
    emojiOptions.isEmojiSuggesting = false
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'habits.form.suggestEmoji' })).toBe(button)
    expect(button.closest('[data-proposed]')).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }).querySelector('[data-proposed]')).toBeInTheDocument()
    expect(button.querySelector('[data-asset^="astra-mark"]')).toBeInTheDocument()
    expect(moveFocus ? phrase : button).toHaveFocus()
  })

  it('keeps the emoji request visible and busy while blocking competing emoji edits', () => {
    const onSuggestEmoji = vi.fn()
    renderForm(createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 }), undefined, false, false, null, undefined, { onSuggestEmoji, isEmojiSuggesting: true })
    const button = screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeDisabled()
    fireEvent.click(button)
    expect(onSuggestEmoji).not.toHaveBeenCalled()
  })

  it('explains the emoji allowance boundary and keeps request failures inline', () => {
    mockProfileState.aiMessagesUsed = 5
    const emojiOptions = { onSuggestEmoji: vi.fn(), emojiSuggestionError: undefined as string | undefined }
    const view = renderForm(createFormHelpers({ title: 'Swim' }), undefined, false, false, null, undefined, emojiOptions)
    const alert = screen.getByRole('alert')
    expect(alert).toBeEmptyDOMElement()
    emojiOptions.emojiSuggestionError = 'Try again'
    view.rerenderForm()
    expect(screen.getByRole('alert')).toBe(alert)
    const button = screen.getByRole('button', { name: 'habits.form.suggestEmoji' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    expect(screen.getByRole('alert').closest('[data-habit-title-row]')).toBeNull()
    expect(button).toHaveAccessibleDescription(expect.stringContaining('Try again'))
  })

  it('announces the details state and identifies the reminders region across toggles', () => {
    renderForm()
    const disclosure = screen.getByRole('button', { name: 'habits.form.moreDetails' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).not.toHaveAttribute('aria-controls')

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    const regionId = disclosure.getAttribute('aria-controls')
    expect(regionId).toBeTruthy()
    const region = document.getElementById(regionId!)!
    expect(region).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: 'habits.form.steps' })).toBeInTheDocument()

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).toHaveAttribute('aria-controls', regionId)
    expect(region).toHaveAttribute('inert')

    const transitionEnd = new Event('transitionend', { bubbles: true })
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'opacity' })
    fireEvent(region, transitionEnd)
    expect(region).not.toBeInTheDocument()
    expect(disclosure).not.toHaveAttribute('aria-controls')

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure).toHaveAttribute('aria-controls', regionId)
    expect(document.getElementById(regionId!)).toBeInTheDocument()
  })

  it('keeps the timed reminder toggle label distinct from its section heading', () => {
    formLocale.realReminders = true
    renderForm(createFormHelpers({ dueTime: '08:00' }), undefined, true)
    fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toBeInTheDocument()
  })

  it('shows one unresolved reading before corrections and the Astra ask, without an understood card', () => {
    renderForm(createFormHelpers({ title: 'Beber mais água quando der' }), vi.fn(), false, true)
    expect(screen.getAllByText('habits.form.unresolved')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Monday' })).toBeEnabled()
    const unresolved = screen.getByText('habits.form.unresolved')
    const corrections = screen.getByRole('button', { name: 'Monday' })
    const ask = screen.getByRole('button', { name: 'habits.form.askAstra' })
    expect(unresolved.compareDocumentPosition(corrections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(corrections.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([false, true])('selects and clears an emoji beside the title, schedule locked: %s', async (lockedGeneral) => {
    const formHelpers = createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const view = renderForm(formHelpers, undefined, false, false, lockedGeneral)
    expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🏃' }))
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '🏃', { shouldDirty: true }))
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🏃')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '', { shouldDirty: true })
  })

  it.each(['', '   '])('hides the preview and retains the emoji well for an empty phrase %j even with a saved schedule', (title) => {
    renderForm(createFormHelpers({ title, emoji: '🏃', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
  })

  it('hides the preview and retains the emoji well while Astra reads a phrase with an existing schedule', () => {
    const view = renderForm(createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    view.rerenderForm(true)
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
  })

  it('shows the emoji well in a fresh empty form', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
  })

  it('keeps a chosen emoji through clearing, parsing and losing the understood schedule', async () => {
    let formHelpers!: HabitFormHelpers
    function CreateFormHarness({ isSuggesting = false }: { isSuggesting?: boolean }) {
      formHelpers = useHabitForm({ initialData: { itemType: 'habit' } })
      return <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting={isSuggesting} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const buildForm = (isSuggesting = false) => <QueryClientProvider client={queryClient}><CreateFormHarness isSuggesting={isSuggesting} /></QueryClientProvider>
    const view = render(buildForm())
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }), { target: { value: 'Run every day' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🌱' }))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    const expectHidden = () => {
      expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
      expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeInTheDocument()
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    fireEvent.change(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }), { target: { value: '' } })
    expectHidden()
    fireEvent.change(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ }), { target: { value: 'Run every day' } })
    view.rerender(buildForm(true))
    expectHidden()
    view.rerender(buildForm())
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    act(() => formHelpers.form.setValue('frequencyUnit', null))
    expectHidden()
    act(() => formHelpers.form.setValue('frequencyUnit', 'Day'))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')
  })

  it('places the details row on the padded column edge', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toHaveStyle({ minHeight: 'var(--row-h-compact)', position: 'relative', paddingBlock: '12px' })
  })

  it.each(['en', 'pt-BR'])('renders an editable date in %s', (locale) => {
    formLocale.language = locale
    formLocale.realDates = true
    renderForm(createFormHelpers({ itemType: 'task' }))
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toBeVisible()
    expect(screen.queryByText('habits.form.startDateReason')).toBeNull()
    formLocale.realDates = false
  })

  it.each([
    ['en', 'A habit you want to avoid. Log each slip.'],
    ['pt-BR', 'Um hábito que você quer evitar. Registre cada deslize.'],
  ])('defines avoidance and explains slip logging in %s', (locale, expected) => {
    formLocale.language = locale
    renderForm(createFormHelpers({ isBadHabit: true }), undefined, true)
    expect(screen.getByText(expected)).toBeVisible()
  })

  it('starts with type, title and editable date fields and closed details', () => {
    renderForm(createFormHelpers({ itemType: 'task' }))
    expect(screen.getByLabelText(/habits.form.(?:taskDescribe|describe)/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toBeDefined()
    expect(screen.queryByText('habits.form.oneTimeTask')).toBeNull()
    expect(screen.queryByText('habits.form.recurring')).toBeNull()
    expect(screen.queryByText('habits.form.flexible')).toBeNull()
    expect(screen.queryByText('habits.form.general')).toBeNull()
    expect(screen.getByText('habits.form.taskDate')).toBeDefined()
    expect(screen.queryByText('checklist-editor')).toBeNull()
  })

  it('shows the understanding preview and applies correction controls', () => {
    const formHelpers = createFormHelpers({ title: 'Run', frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true })
    const view = renderForm(formHelpers)
    expect(screen.getByLabelText('habits.form.understood')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    view.unmount()

    const flexibleHelpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3, isFlexible: true })
    renderForm(flexibleHelpers)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(flexibleHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(flexibleHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 4, { shouldDirty: true })
  })

  it('uses the localized full weekday name for the correction control', () => {
    const formHelpers = createFormHelpers({ title: 'Correr' })
    formHelpers.daysList[0] = {
      value: 'Monday',
      label: 'Seg',
      accessibleLabel: 'Segunda-feira',
    }

    renderForm(formHelpers)

    expect(screen.getByRole('button', { name: 'Segunda-feira' })).toBeDefined()
  })

  it('states daily, timed daily, timed fixed-day, and timed flexible schedules exactly', () => {
    const formHelpers = createFormHelpers({
      title: 'Run',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })
    const view = renderForm(formHelpers)

    expect(screen.getByText('every day')).toBeDefined()
    expect(formHelpers.daysList.every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', true)

    formHelpers.testValues.days = formHelpers.daysList.map((day) => day.value).filter((day) => day !== 'Monday')
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'false')
    expect(formHelpers.daysList.slice(1).every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)

    formHelpers.testValues.days = []
    view.rerenderForm()
    expect(formHelpers.daysList.every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)

    formHelpers.testValues.dueTime = '07:00'
    view.rerenderForm()

    expect(screen.getByText('every day at 07:00')).toBeDefined()

    formHelpers.testValues.days = ['Monday']
    formHelpers.testValues.dueTime = '08:00'
    view.rerenderForm()

    expect(screen.getByText('every Monday at 08:00')).toBeDefined()

    formHelpers.testValues.days = []
    formHelpers.testValues.isFlexible = true
    formHelpers.testValues.frequencyUnit = 'Week'
    formHelpers.testValues.frequencyQuantity = 3
    formHelpers.testValues.dueTime = '09:00'
    view.rerenderForm()

    expect(screen.getByText('3 times a week, any day, at 09:00')).toBeDefined()

    formHelpers.testValues.isFlexible = false
    formHelpers.testValues.frequencyUnit = null
    formHelpers.testValues.dueTime = '15:00'
    view.rerenderForm()

    expect(screen.getByText('At 15:00')).toBeDefined()
  })

  it('applies a time-only local phrase without inventing a cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Dentist at 15:00' })
    renderForm(formHelpers, undefined, false, true)

    await waitFor(() => {
      expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
    })
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('reconciles parser-owned fields across phrase changes without clearing a manual cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const view = renderForm(formHelpers, undefined, false, true)

    await waitFor(() => expect(formHelpers.setRecurring).toHaveBeenCalledOnce())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '08:00', { shouldDirty: true })

    fireEvent.click(screen.getByRole('button', { name: 'Thursday' }))
    formHelpers.testValues.title = 'Run'
    view.rerenderForm()

    await waitFor(() => expect(formHelpers.setOneTime).not.toHaveBeenCalled())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true })

    formHelpers.testValues.title = 'Dentist at 15:00'
    view.rerenderForm()
    await waitFor(() => {
      expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
    })
  })

  it('preserves a locked General schedule through local reads and both corrections', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday', isGeneral: true })
    renderForm(formHelpers, undefined, false, true, true)

    await waitFor(() => expect(formHelpers.setGeneral).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Monday' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'habits.form.moreOften' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()

    expect(formHelpers.setGeneral).toHaveBeenCalledOnce()
    expect(formHelpers.setRecurring).not.toHaveBeenCalled()
    expect(formHelpers.setFlexible).not.toHaveBeenCalled()
    expect(formHelpers.toggleDay).not.toHaveBeenCalled()
  })

  it('preserves an Astra schedule across the next title edit', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const onSuggestSetup = vi.fn(() => {
      formHelpers.testValues.frequencyUnit = 'Week'
      formHelpers.testValues.frequencyQuantity = 3
      formHelpers.testValues.dueTime = '07:00'
      return SETUP_PROPOSAL
    })
    const view = renderForm(formHelpers, onSuggestSetup, false, true)
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '08:00', { shouldDirty: true }))

    formHelpers.testValues.title = 'Build a stronger routine'
    view.rerenderForm()
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true }))
    formHelpers.testValues.days = []
    formHelpers.testValues.frequencyUnit = null
    view.rerenderForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledOnce())

    vi.mocked(formHelpers.form.setValue).mockClear()
    vi.mocked(formHelpers.setOneTime).mockClear()
    formHelpers.testValues.title = 'Build a calmer routine'
    view.rerenderForm()
    await waitFor(() => expect(formHelpers.form.setValue).not.toHaveBeenCalledWith('dueTime', '', { shouldDirty: true }))
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('reveals the detail sections from the single disclosure', () => {
    mockProfileState.hasProAccess = true
    renderForm(createFormHelpers({ title: 'Run', isBadHabit: true }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(screen.getByText('goal-linking')).toBeDefined()
    expect(screen.getAllByText('date-field').length).toBeGreaterThan(0)
    expect(screen.getByText('slip-alert')).toBeDefined()
  })

  it('names the description field once in the owning form', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)
    expect(screen.getAllByText('habits.form.description')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'habits.form.description' })).toBeInTheDocument()
  })

  it('hides slip alerts for a positive habit', () => {
    mockProfileState.hasProAccess = true
    renderForm(createFormHelpers({ title: 'Run', isBadHabit: false }), undefined, true)

    expect(screen.queryByText('slip-alert')).toBeNull()
  })

  it('hides slip alerts after switching a bad habit back to positive', () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ title: 'Run', isBadHabit: true })
    const view = renderForm(formHelpers, undefined, true)
    expect(screen.getByText('slip-alert')).toBeDefined()

    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.habitTypeAvoid' }))
    view.rerenderForm()

    expect(screen.queryByText('slip-alert')).toBeNull()
  })

  it.each([
    { mode: 'one-time', isOneTime: true, isGeneral: false },
    { mode: 'General', isOneTime: false, isGeneral: true },
  ])('hides the end date for $mode habits', ({ isOneTime, isGeneral }) => {
    const formHelpers = createFormHelpers({ title: 'Run' })
    Object.assign(formHelpers, { isOneTime, isGeneral, showEndDate: false })

    renderForm(formHelpers, undefined, true)

    expect(screen.queryByText('habits.form.endDate')).toBeNull()
  })

  it('keeps sub-habits and goals available without an upgrade row', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)

    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(screen.getByText('goal-linking')).toBeDefined()
  })

  it('nests fixed clock reminders under the offset reminder switch for a timed habit', () => {
    const formHelpers = createFormHelpers({ title: 'Run', reminderEnabled: true, dueTime: '08:00' })
    renderForm(formHelpers, undefined, true)
    fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))

    expect(screen.getByText('offset-reminders')).toBeDefined()
    expect(screen.getByText('scheduled-reminders')).toBeDefined()
    const scheduled = screen.getByText('scheduled-reminders')
    expect(screen.getByText('offset-reminders')).toContainElement(scheduled)
    expect(scheduled).toHaveAttribute('data-offset-count', '0')
    fireEvent.click(scheduled)
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('scheduledReminders', [{ when: 'day_before', time: '18:00' }], { shouldDirty: true })
  })

  it('preserves a prefilled end time when the exact time changes', () => {
    const formHelpers = createFormHelpers({ title: 'Run', reminderEnabled: true, dueTime: '08:00', dueEndTime: '09:00' })
    renderForm(formHelpers, undefined, true)
    fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))

    fireEvent.change(screen.getByLabelText('habits.form.exactTime'), { target: { value: '10:00' } })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '10:00', { shouldDirty: true })
    expect(formHelpers.form.getValues('dueEndTime')).toBe('09:00')
  })

  it('keeps every local control live when the Astra allowance is exhausted', () => {
    mockProfileState.aiMessagesUsed = 5
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    const formHelpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3 })
    renderForm(formHelpers, onSuggestSetup)

    const ask = screen.getByRole('button', { name: 'habits.form.askAstra' })
    expect(ask).toBeDisabled()
    fireEvent.click(ask)
    expect(onSuggestSetup).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
  })

  it('disables Astra at the Pro allowance too', () => {
    mockProfileState.hasProAccess = true
    mockProfileState.aiMessagesUsed = 5
    renderForm(createFormHelpers({ title: 'Run' }), vi.fn(() => SETUP_PROPOSAL))

    expect(screen.getByRole('button', { name: 'habits.form.askAstra' })).toBeDisabled()
  })

  it.each([
    ['day', () => fireEvent.click(screen.getByRole('button', { name: 'Monday' }))],
    ['emoji', async () => {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
      fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🏃' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }],
  ])('resolves a proposed setup on the first %s correction', async (_kind, correct) => {
    const helpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3 })
    renderForm(helpers, async () => {
      applySuggestionSchedule(setupPatch, helpers)
      return SETUP_PROPOSAL
    })

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' }).closest('[data-proposed]')).toBeInTheDocument())

    await correct()

    expect(screen.getByRole('region', { name: 'habits.form.understood' }).closest('[data-proposed]')).toBeNull()
  })

  it('allows Astra again after the proposed phrase changes', async () => {
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title: 'Build a stronger routine' }), onSuggestSetup)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.change(screen.getByLabelText(/habits.form.(?:taskDescribe|describe)/), {
      target: { value: 'Build a calmer routine' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))

    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledTimes(2))
  })

  it('preserves breakdown proposals when correcting proposed setup', async () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ title: 'Build a stronger routine' })
    renderForm(formHelpers, () => {
      applySuggestionSchedule(setupPatch, formHelpers)
      formHelpers.testValues.checklistItems = [{ text: 'Prepare', isChecked: false }]
      return COMBINED_PROPOSAL
    }, true)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull())
    expect(screen.getByRole('spinbutton').closest('[data-proposed]')).not.toBeNull()
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1')

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))

    expect(document.querySelectorAll('[data-proposed]')).toHaveLength(1)
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1')
    expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull()
  })

  it('keeps a pre-existing checklist normal when Astra proposes only setup', async () => {
    const helpers = createFormHelpers({ title: 'Run', checklistItems: [{ text: 'Shoes', isChecked: false }] })
    renderForm(helpers, () => {
      applySuggestionSchedule(setupPatch, helpers)
      return SETUP_PROPOSAL
    }, true)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' }).closest('[data-proposed]')).toBeInTheDocument())
    expect(screen.getByText('checklist-editor').closest('[data-proposed]')).toBeNull()
  })

  it('marks only an Astra checklist proposal and resolves it when edited', async () => {
    renderForm(
      createFormHelpers({
        title: 'Run',
        frequencyQuantity: 3,
        checklistItems: [{ text: 'Shoes', isChecked: false }],
      }),
      () => CHECKLIST_PROPOSAL,
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1'))
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.click(screen.getByText('checklist-editor'))
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '0')
  })

  it('resolves a proposed sub-habit section when its parent editor changes it', async () => {
    mockProfileState.hasProAccess = true
    let resolveProposal = () => {}
    renderForm(
      createFormHelpers({ title: 'Run' }),
      () => SUB_HABIT_PROPOSAL,
      true,
      false,
      null,
      (resolve) => { resolveProposal = resolve },
    )

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull())

    act(() => resolveProposal())
    expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).toBeNull()
  })
})

it('focuses the visible description failure without opening details', () => {
  const helpers = createFormHelpers()
  helpers.backendFieldErrors = { description: 'Server description failure' }
  helpers.backendFocusField = 'description'
  helpers.backendFocusRequest = 1
  const view = renderForm(helpers)
  expect(screen.getByLabelText('habits.form.description')).toHaveFocus()
  expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toHaveAttribute('aria-expanded', 'false')
  helpers.backendFocusRequest = 2
  view.rerenderForm()
  expect(screen.getByLabelText('habits.form.description')).toHaveFocus()
})


it.each([
  { itemType: 'task' },
  { itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 1 },
  { itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 2 },
  { itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'] },
  { itemType: 'task', isGeneral: true },
])('offers and saves Repeat every from the timing sheet for %j', (schedule) => {
  const helpers = createFormHelpers({ title: 'Water', reminderEnabled: true, dueTime: '08:00', scheduledReminders: [{ when: 'same_day', time: '09:00' }], ...schedule })
  helpers.isGeneral = 'isGeneral' in schedule
  renderForm(helpers)
  fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))
  fireEvent.click(screen.getByRole('radio', { name: 'habits.form.repeatEvery' }))
  expect(helpers.form.getValues('scheduledReminders')).toEqual([])
  expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.testValues), [15], [], [], [])).toMatchObject({ repeatReminder: { intervalMinutes: 30, startAtUtc: expect.stringMatching(/Z$/) }, reminderEnabled: true, reminderTimes: [], scheduledReminders: [], relativeReminders: [] })
})

it('explains both item types and exposes habit frequency before opening details', () => {
  renderForm(createFormHelpers({ itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1 }))
  expect(screen.getByText('habits.form.typeTaskHint')).toBeVisible()
  expect(screen.getByText('habits.form.typeHabitHint')).toBeVisible()
  expect(screen.getByRole('radiogroup', { name: 'habits.form.frequency' })).toBeVisible()
  expect(screen.queryByRole('radio', { name: /habits.form.noSchedule/ })).toBeNull()
})

it('keeps the type-driven decision order and conditional end time in the owning form', () => {
  formLocale.realController = true
  function OwningForm() {
    const helpers = useHabitForm()
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><OwningForm /></QueryClientProvider>)
  expect(screen.getByRole('radio', { name: /^habits.form.typeTask/ })).toBeChecked()
  const title = screen.getByRole('textbox', { name: 'habits.form.taskDescribe' })
  const description = screen.getByRole('textbox', { name: 'habits.form.description' })
  const when = screen.getByRole('textbox', { name: 'habits.form.datePhrase' })
  const timing = screen.getByRole('button', { name: /habits.form.timingAndReminder/ })
  expect(description).toHaveAttribute('rows', '1')
  for (const [first, second] of [[title, description], [description, when], [when, timing]]) {
    expect(first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  expect(screen.queryByRole('radiogroup', { name: 'habits.form.frequency' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /^habits.form.typeHabit/ }))
  expect(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ })).toBeVisible()
  const frequency = screen.getByRole('radiogroup', { name: 'habits.form.frequency' })
  expect(when.compareDocumentPosition(frequency) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(frequency.compareDocumentPosition(timing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(timing)
  expect(screen.queryByRole('textbox', { name: 'habits.form.dueEndTime' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.exactTime' }), { target: { value: '08:00' } })
  expect(screen.getByRole('textbox', { name: 'habits.form.dueEndTime' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'common.done' }))
  fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
  for (const group of ['steps', 'avoidGroup', 'organize', 'ending']) {
    expect(screen.getByRole('heading', { name: `habits.form.${group}` })).toBeVisible()
  }
})


it('preserves fixed reminder choices when their selected radio is pressed again', () => {
  const onChange = vi.fn()
  render(<RepeatReminderSection value={null} enabled general={false} onToggle={vi.fn()} onChange={onChange} />)
  fireEvent.click(screen.getByRole('radio', { name: 'habits.form.definedTimes' }))
  expect(onChange).not.toHaveBeenCalled()
})


it.each([
  { itemType: 'task', offset: 0, hidden: true },
  { itemType: 'task', offset: 1, hidden: false },
  { itemType: 'habit', offset: 0, hidden: false },
  { itemType: 'habit', offset: 1, hidden: false },
])('retains the day-before choice for $itemType with start offset $offset', ({ itemType, offset, hidden }) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  const helpers = createFormHelpers({ itemType, frequencyUnit: itemType === 'habit' ? 'Day' : null, frequencyQuantity: 1, dueDate: date.toISOString().slice(0, 10), reminderEnabled: true })
  renderForm(helpers)
  fireEvent.click(screen.getByRole('button', { name: /habits.form.timingAndReminder/ }))
  expect(screen.getByText('scheduled-reminders')).toHaveAttribute('data-hide-day-before', String(hidden))
})
