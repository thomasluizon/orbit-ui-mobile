import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0 }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC', aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
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
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => <div>checklist-editor</div> }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => <div>checklist-templates</div> }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => <div>goal-linking</div> }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => <div>offset-reminders</div> }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => <div>scheduled-reminders</div> }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => <div>slip-alert</div> }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => <div>time-field</div> }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => <div>date-field</div> }))

function createFormHelpers(overrides: Record<string, unknown> = {}): HabitFormHelpers {
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
      setValue: vi.fn(),
      formState: { errors: {} },
    } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false,
    showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3) })),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(),
    setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(),
    formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
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
  onSuggestSetup?: () => boolean | Promise<boolean>,
  defaultExpanded = false,
  readPhraseLocally = false,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} defaultExpanded={defaultExpanded} readPhraseLocally={readPhraseLocally}>
        <div>sub-habit-editor</div>
      </HabitFormFields>
    </QueryClientProvider>,
  )
}

describe('HabitFormFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfileState.aiMessagesUsed = 0
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

  it('clears a stale schedule when the current phrase is unresolved', async () => {
    const formHelpers = createFormHelpers({ title: 'Drink water when I can', dueTime: '08:00' })
    renderForm(formHelpers, undefined, false, true)

    await waitFor(() => expect(formHelpers.setOneTime).toHaveBeenCalledOnce())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true })
  })

  it('reveals the detail sections from the single disclosure', () => {
    renderForm(createFormHelpers({ title: 'Run' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(screen.getByText('goal-linking')).toBeDefined()
    expect(screen.getByText('date-field')).toBeDefined()
    expect(screen.getByText('slip-alert')).toBeDefined()
  })

  it('keeps every local control live when the Astra allowance is exhausted', () => {
    mockProfileState.aiMessagesUsed = 5
    const onSuggestSetup = vi.fn(() => true)
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

  it.each([
    ['day', () => fireEvent.click(screen.getByRole('button', { name: 'Monday' }))],
    ['stepper', () => fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))],
    ['emoji', () => fireEvent.click(screen.getByRole('button', { name: 'emoji' }))],
  ])('resolves a proposed setup on the first %s correction', async (_kind, correct) => {
    renderForm(createFormHelpers({ title: 'Run', frequencyQuantity: 3 }), async () => true)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())

    correct()

    expect(screen.getByText('habits.form.understood')).toBeDefined()
  })

  it('marks an Astra checklist proposal until a correction is made', async () => {
    renderForm(
      createFormHelpers({
        title: 'Run',
        frequencyQuantity: 3,
        checklistItems: [{ text: 'Shoes', isChecked: false }],
      }),
      () => true,
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => {
      expect(screen.getAllByRole('group', { name: 'habits.form.proposed' })).toHaveLength(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(screen.queryByRole('group', { name: 'habits.form.proposed' })).toBeNull()
  })
})
