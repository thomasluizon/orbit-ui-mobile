import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormProposal } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false }))
const mockRouterPush = vi.hoisted(() => vi.fn())
const SETUP_PROPOSAL: HabitFormProposal = { setup: true, checklist: false, subHabits: false }
const CHECKLIST_PROPOSAL: HabitFormProposal = { setup: false, checklist: true, subHabits: false }
const SUB_HABIT_PROPOSAL: HabitFormProposal = { setup: false, checklist: false, subHabits: true }
const COMBINED_PROPOSAL: HabitFormProposal = { setup: true, checklist: true, subHabits: true }

const testTranslations: Record<string, string> = {
  'habits.form.understoodDaily': 'Every day',
  'habits.form.understoodDaysAt': 'On {days} at {time}',
  'habits.form.understoodCountAt': '{count} times a week, any day at {time}',
}

function translateTestValue(key: string, values?: Record<string, unknown>): string {
  const template = testTranslations[key]
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('next-intl', () => ({
  useTranslations: () => translateTestValue,
  useLocale: () => 'en',
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

vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({
  HabitEmojiSelector: ({ onSelect }: { onSelect: (emoji: string) => void }) => <button type="button" onClick={() => onSelect('🏃')}>emoji</button>,
}))
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ onItemsChange }: { onItemsChange?: (items: Array<{ text: string; isChecked: boolean }>) => void }) => (
    <button type="button" onClick={() => onItemsChange?.([{ text: 'Edited', isChecked: false }])}>checklist-editor</button>
  ),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => <div>checklist-templates</div> }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => <div>goal-linking</div> }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => <div>offset-reminders</div> }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => <div>scheduled-reminders</div> }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => <div>slip-alert</div> }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => <div>time-field</div> }))
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
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3) })),
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
  const buildForm = () => (
    <QueryClientProvider client={queryClient}>
      <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} defaultExpanded={defaultExpanded} readPhraseLocally={readPhraseLocally} lockedGeneral={lockedGeneral} onResolveSubHabitProposalReady={onResolveSubHabitProposalReady}>
        <div>sub-habit-editor</div>
      </HabitFormFields>
    </QueryClientProvider>
  )
  const view = render(buildForm())
  return { ...view, rerenderForm: () => view.rerender(buildForm()) }
}

describe('HabitFormFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const formHelpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3 })
    renderForm(formHelpers)
    expect(screen.getByLabelText('habits.form.understood')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 4, { shouldDirty: true })
  })

  it('states daily, timed fixed-day, and timed flexible schedules exactly', () => {
    const formHelpers = createFormHelpers({
      title: 'Run',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })
    const view = renderForm(formHelpers)

    expect(screen.getByText('Every day')).toBeDefined()

    formHelpers.testValues.days = ['Monday']
    formHelpers.testValues.dueTime = '08:00'
    view.rerenderForm()

    expect(screen.getByText('On Mon at 08:00')).toBeDefined()

    formHelpers.testValues.days = []
    formHelpers.testValues.isFlexible = true
    formHelpers.testValues.frequencyUnit = 'Week'
    formHelpers.testValues.frequencyQuantity = 3
    formHelpers.testValues.dueTime = '09:00'
    view.rerenderForm()

    expect(screen.getByText('3 times a week, any day at 09:00')).toBeDefined()
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

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))

    expect(formHelpers.setGeneral).toHaveBeenCalledTimes(3)
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
    renderForm(createFormHelpers({ title: 'Run' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(screen.getByText('goal-linking')).toBeDefined()
    expect(screen.getByText('date-field')).toBeDefined()
    expect(screen.getByText('slip-alert')).toBeDefined()
  })

  it('routes the free sub-habit row to upgrade while keeping goals available', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)

    fireEvent.click(screen.getByRole('button', { name: /habits\.form\.subHabits/ }))
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
    expect(screen.getByText('goal-linking')).toBeDefined()
  })

  it('nests fixed clock reminders under the offset reminder switch for a timed habit', () => {
    renderForm(createFormHelpers({ title: 'Run', dueTime: '08:00' }), undefined, true)

    expect(screen.getByText('offset-reminders')).toBeDefined()
    expect(screen.getByText('scheduled-reminders')).toBeDefined()
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
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday')
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
    ['stepper', () => fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))],
    ['emoji', () => fireEvent.click(screen.getByRole('button', { name: 'emoji' }))],
  ])('resolves a proposed setup on the first %s correction', async (_kind, correct) => {
    renderForm(createFormHelpers({ title: 'Run', frequencyQuantity: 3 }), async () => SETUP_PROPOSAL)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())

    correct()

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
    renderForm(createFormHelpers({ title: 'Build a stronger routine' }), () => COMBINED_PROPOSAL, true)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(document.querySelectorAll('[data-proposed]')).toHaveLength(3))

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))

    expect(document.querySelectorAll('[data-proposed]')).toHaveLength(2)
    expect(screen.getByText('checklist-editor').closest('[data-proposed]')).not.toBeNull()
    expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull()
  })

  it('keeps a pre-existing checklist normal when Astra proposes only setup', async () => {
    renderForm(
      createFormHelpers({
        title: 'Run',
        frequencyQuantity: 3,
        checklistItems: [{ text: 'Shoes', isChecked: false }],
      }),
      () => SETUP_PROPOSAL,
      true,
    )

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
    await waitFor(() => expect(screen.getByText('checklist-editor').closest('[data-proposed]')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.click(screen.getByText('checklist-editor'))
    expect(screen.getByText('checklist-editor').closest('[data-proposed]')).toBeNull()
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
