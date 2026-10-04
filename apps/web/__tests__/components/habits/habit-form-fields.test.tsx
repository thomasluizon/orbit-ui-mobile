import React from 'react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { buildHabitFormPatchFromSuggestion } from '@orbit/shared/utils'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

const formLocale = vi.hoisted(() => ({ language: 'en', realReminders: false }))
const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false }))
const mockRouterPush = vi.hoisted(() => vi.fn())
const setupPatch = buildHabitFormPatchFromSuggestion({ emoji: null, frequencyUnit: 'Week', frequencyQuantity: 3, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
const SETUP_PROPOSAL: HabitFormProposal = { setup: true, checklist: false, subHabits: false, checklistItems: 0, subHabitItems: 0 }
const CHECKLIST_PROPOSAL: HabitFormProposal = { setup: false, checklist: true, subHabits: false, checklistItems: 1, subHabitItems: 0 }
const SUB_HABIT_PROPOSAL: HabitFormProposal = { setup: false, checklist: false, subHabits: true, checklistItems: 0, subHabitItems: 1 }
const COMBINED_PROPOSAL: HabitFormProposal = { setup: true, checklist: true, subHabits: true, checklistItems: 1, subHabitItems: 1 }

const testTranslations: Record<string, string> = {
  'dates.daysValue.monday': 'Monday',
  'habits.form.understoodDaily': 'every day',
  'habits.form.understoodDailyAt': 'every day at {time}',
  'habits.form.understoodDayAt': 'every {days} at {time}',
  'habits.form.understoodCountAt': '{count} times a week, any day, at {time}',
  'habits.form.understoodTime': 'At {time}',
}

function translateTestValue(key: string, values?: Record<string, unknown>): string {
  const messages = formLocale.language === 'en' ? en : ptBR
  const template = key === 'habits.form.startDateValue' ? messages.habits.form.startDateValue : testTranslations[key]
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('react-hook-form', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-hook-form')>(),
  useController: () => ({ field: { ref: vi.fn() } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => translateTestValue,
  useLocale: () => formLocale.language,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC', hasProAccess: mockProfileState.hasProAccess, aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ onItemsChange, proposedItemCount }: { onItemsChange?: (items: Array<{ text: string; isChecked: boolean }>) => void; proposedItemCount?: number }) => (
    <button data-proposed-item-count={proposedItemCount} type="button" onClick={() => onItemsChange?.([{ text: 'Edited', isChecked: false }])}>checklist-editor</button>
  ),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => <div>checklist-templates</div> }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => <div>goal-linking</div> }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/reminder-section')>()
  return { ReminderSection: (props: React.ComponentProps<typeof actual.ReminderSection>) => formLocale.realReminders ? <actual.ReminderSection {...props} /> : <div>offset-reminders{props.children}</div> }
})
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false }) }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: (props: { onSetScheduledReminders: (items: { when: string; time: string }[]) => void; nested?: boolean; offsetReminderCount?: number }) => <button type="button" data-nested={String(props.nested)} data-offset-count={props.offsetReminderCount} onClick={() => props.onSetScheduledReminders([{ when: 'day_before', time: '18:00' }])}>scheduled-reminders</button> }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => <div>slip-alert</div> }))
vi.mock('@/components/ui/time-field', () => ({
  TimeField: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('10:00')}>time-field</button>
  ),
}))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => <div>date-field</div> }))

type TestHabitFormHelpers = HabitFormHelpers & { testValues: Record<string, unknown> }

function createFormHelpers(overrides: Record<string, unknown> = {}): TestHabitFormHelpers {
  const values: Record<string, unknown> = {
    title: '', emoji: '', frequencyUnit: null, frequencyQuantity: null, days: [],
    isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '',
    description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [],
    isBadHabit: false, slipAlertEnabled: false, ...overrides,
  }
  return {
    form: {
      watch: vi.fn((field: string) => values[field]),
      getValues: vi.fn((field: string) => values[field]),
      setValue: vi.fn((field: string, value: unknown) => { values[field] = value }),
      formState: { errors: {} },
    } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false,
    showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(),
    setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(),
    formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
    testValues: values,
  }
}

function createTags(): TagSelectionState {
  return {
    selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(),
    resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '',
    setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [],
    createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null,
    editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F',
    setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(),
    cancelEditTag: vi.fn(), deleteTag: vi.fn(),
  }
}

function renderForm(
  formHelpers = createFormHelpers(),
  onSuggestSetup?: () => HabitFormProposal | Promise<HabitFormProposal>,
  defaultExpanded = false,
  readPhraseLocally = false,
  lockedGeneral: boolean | null = null,
  onResolveSubHabitProposalReady?: (resolve: () => void) => void,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const buildForm = (isSuggesting = false) => (
    <QueryClientProvider client={queryClient}>
      <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} isSuggesting={isSuggesting} defaultExpanded={defaultExpanded} readPhraseLocally={readPhraseLocally} lockedGeneral={lockedGeneral} onResolveSubHabitProposalReady={onResolveSubHabitProposalReady}>
        <div>sub-habit-editor</div>
      </HabitFormFields>
    </QueryClientProvider>
  )
  const view = render(buildForm())
  return { ...view, rerenderForm: (isSuggesting = false) => view.rerender(buildForm(isSuggesting)) }
}

describe('HabitFormFields', () => {
  it('keeps the timed reminder toggle label distinct from its section heading', () => {
    formLocale.realReminders = true
    renderForm(createFormHelpers({ dueTime: '08:00' }), undefined, true)
    expect(screen.getAllByText('habits.form.reminders')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'habits.form.reminders' })).toBeInTheDocument()
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

  it.each([false, true])('selects and clears an emoji inside the preview, schedule locked: %s', async (lockedGeneral) => {
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

  it.each(['', '   '])('hides the preview and emoji well for an empty phrase %j even with a saved schedule', (title) => {
    renderForm(createFormHelpers({ title, emoji: '🏃', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
  })

  it('hides the preview and emoji well while Astra reads a phrase with an existing schedule', () => {
    const view = renderForm(createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    view.rerenderForm(true)
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
  })

  it('shows no emoji well in a fresh empty form', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
  })

  it('keeps a chosen emoji through clearing, parsing and losing the understood schedule', async () => {
    let formHelpers!: HabitFormHelpers
    function CreateFormHarness({ isSuggesting = false }: { isSuggesting?: boolean }) {
      formHelpers = useHabitForm()
      return <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting={isSuggesting} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const buildForm = (isSuggesting = false) => <QueryClientProvider client={queryClient}><CreateFormHarness isSuggesting={isSuggesting} /></QueryClientProvider>
    const view = render(buildForm())
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run every day' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🌱' }))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    const expectHidden = () => {
      expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
    expectHidden()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run every day' } })
    view.rerender(buildForm(true))
    expectHidden()
    view.rerender(buildForm())
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    act(() => formHelpers.form.setValue('frequencyUnit', null))
    expectHidden()
    act(() => formHelpers.form.setValue('frequencyUnit', 'Day'))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')
  })

  it('uses a bare compact details row', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingInlineStart: '0px', paddingBlock: '4px' })
  })

  it.each([
    ['en', 'Starts on September 2'],
    ['pt-BR', 'Começa em 2 de setembro'],
  ])('renders a word start date in %s', (locale, expected) => {
    formLocale.language = locale
    renderForm()
    expect(screen.getByText(expected)).toBeDefined()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    formLocale.language = 'en'
    formLocale.realReminders = false
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
  })

  it('starts with one phrase field, closed details, and an immutable start date', () => {
    renderForm()
    expect(screen.getByLabelText('habits.form.describe')).toBeDefined()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toBeDefined()
    expect(screen.queryByText('habits.form.oneTimeTask')).toBeNull()
    expect(screen.queryByText('habits.form.recurring')).toBeNull()
    expect(screen.queryByText('habits.form.flexible')).toBeNull()
    expect(screen.queryByText('habits.form.general')).toBeNull()
    expect(screen.getByText('habits.form.startDate')).toBeDefined()
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
    expect(screen.getByText('date-field')).toBeDefined()
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

    expect(screen.queryByText('date-field')).toBeNull()
  })

  it('routes the free sub-habit row to upgrade while keeping goals available', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)

    fireEvent.click(screen.getByRole('button', { name: /common\.upgrade/ }))
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
    expect(screen.getByText('goal-linking')).toBeDefined()
  })

  it('nests fixed clock reminders under the offset reminder switch for a timed habit', () => {
    const formHelpers = createFormHelpers({ title: 'Run', dueTime: '08:00' })
    renderForm(formHelpers, undefined, true)

    expect(screen.getByText('offset-reminders')).toBeDefined()
    expect(screen.getByText('scheduled-reminders')).toBeDefined()
    const scheduled = screen.getByText('scheduled-reminders')
    expect(scheduled).toHaveAttribute('data-nested', 'true')
    expect(scheduled).toHaveAttribute('data-offset-count', '0')
    fireEvent.click(scheduled)
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('scheduledReminders', [{ when: 'day_before', time: '18:00' }], { shouldDirty: true })
  })

  it('clears a prefilled end time when the exact time changes', () => {
    const formHelpers = createFormHelpers({ title: 'Run', dueTime: '08:00', dueEndTime: '09:00' })
    renderForm(formHelpers, undefined, true)

    fireEvent.click(screen.getByRole('button', { name: 'time-field' }))

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '10:00', { shouldDirty: true })
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueEndTime', '', { shouldDirty: true })
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
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())

    await correct()

    expect(screen.getByText('habits.form.understood')).toBeDefined()
  })

  it('allows Astra again after the proposed phrase changes', async () => {
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title: 'Build a stronger routine' }), onSuggestSetup)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.change(screen.getByLabelText('habits.form.describe'), {
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
    await waitFor(() => expect(document.querySelectorAll('[data-proposed]')).toHaveLength(2))
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
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())
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


describe('cadence corrections without a type picker', () => {
  it('shows only days for a parsed fixed schedule', () => {
    renderForm(createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('button', { name: 'Monday' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'habits.form.moreOften' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
  })

  it.each([
    { title: 'Run 3 times a week', isFlexible: true, frequencyUnit: 'Week', frequencyQuantity: 3 },
    { title: 'Run', isFlexible: false, frequencyUnit: null, frequencyQuantity: null },
  ])('offers day and count corrections for $title', (values) => {
    const formHelpers = createFormHelpers(values)
    renderForm(formHelpers)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalled()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
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

  it('keeps repeat intervals inside more details', () => {
    const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
    renderForm(formHelpers)
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
    fireEvent.click(screen.getByText('habits.form.moreDetails'))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('intervalWeeks', 2, { shouldDirty: true })
  })
})
