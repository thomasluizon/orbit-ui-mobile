import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
}))

vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: () => <div data-testid="habit-checklist" />,
}))

vi.mock('@/components/habits/checklist-templates', () => ({
  ChecklistTemplates: () => <div data-testid="checklist-templates" />,
}))

vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: () => <div data-testid="goal-linking-field" />,
}))

vi.mock('@/components/ui/app-date-picker', () => ({
  AppDatePicker: () => <div data-testid="app-date-picker" />,
}))

vi.mock('@/components/ui/app-select', () => ({
  AppSelect: ({ label }: { label?: string }) => (
    <div data-testid="app-select">{label}</div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFormHelpers(overrides?: Partial<HabitFormHelpers>): HabitFormHelpers {
  return {
    form: {
      register: vi.fn(() => ({ name: 'test', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() })),
      watch: vi.fn((field: string) => {
        const defaults: Record<string, unknown> = {
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          days: [],
          dueDate: '2025-01-01',
          dueTime: '',
          dueEndTime: '',
          endDate: '',
          isBadHabit: false,
          reminderEnabled: false,
          slipAlertEnabled: false,
          checklistItems: [],
          scheduledReminders: [],
        }
        return defaults[field] ?? ''
      }),
      setValue: vi.fn(),
      getValues: vi.fn(),
      formState: { errors: {} },
    } as unknown as HabitFormHelpers['form'],
    isOneTime: false,
    isGeneral: false,
    isFlexible: false,
    isRecurring: true,
    showDayPicker: false,
    showEndDate: true,
    daysList: [
      { value: 'Monday', label: 'Mon' },
      { value: 'Tuesday', label: 'Tue' },
      { value: 'Wednesday', label: 'Wed' },
      { value: 'Thursday', label: 'Thu' },
      { value: 'Friday', label: 'Fri' },
      { value: 'Saturday', label: 'Sat' },
      { value: 'Sunday', label: 'Sun' },
    ],
    frequencyUnits: [
      { value: 'Day', label: 'Day' },
      { value: 'Week', label: 'Week' },
      { value: 'Month', label: 'Month' },
    ],
    setOneTime: vi.fn(),
    setRecurring: vi.fn(),
    setFlexible: vi.fn(),
    setGeneral: vi.fn(),
    toggleDay: vi.fn(),
    formatTimeInput: vi.fn((v: string) => v),
    formatEndTimeInput: vi.fn((v: string) => v),
    validateAll: vi.fn(() => null),
    ...overrides,
  }
}

function createMockTags(overrides?: Partial<TagSelectionState>): TagSelectionState {
  return {
    selectedTagIds: [],
    atTagLimit: false,
    toggleTag: vi.fn(),
    resetTags: vi.fn(),
    showNewTag: false,
    setShowNewTag: vi.fn(),
    newTagName: '',
    setNewTagName: vi.fn(),
    newTagColor: '#7c3aed',
    setNewTagColor: vi.fn(),
    tagColors: ['#7c3aed', '#dc2626', '#047857'] as readonly string[],
    createAndSelectTag: vi.fn(),
    editingTagId: null,
    editTagName: '',
    setEditTagName: vi.fn(),
    editTagColor: '#7c3aed',
    setEditTagColor: vi.fn(),
    startEditTag: vi.fn(),
    saveEditTag: vi.fn(),
    cancelEditTag: vi.fn(),
    deleteTag: vi.fn(),
    ...overrides,
  }
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HabitFormFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    // Should render the title field
    expect(screen.getByText('habits.form.title')).toBeDefined()
  })

  it('renders the title input label', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.title')).toBeDefined()
  })

  it('renders the description input label', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.description')).toBeDefined()
  })

  it('shows schedule type buttons', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.oneTimeTask')).toBeDefined()
    expect(screen.getByText('habits.form.recurring')).toBeDefined()
    expect(screen.getByText('habits.form.flexible')).toBeDefined()
    expect(screen.getByText('habits.form.general')).toBeDefined()
  })

  it('shows bad habit toggle label', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.badHabitLabel')).toBeDefined()
  })

  it('shows tags section label', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.tags')).toBeDefined()
  })

  it('shows day picker when showDayPicker is true', () => {
    const formHelpers = createMockFormHelpers({ showDayPicker: true, isGeneral: false })
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.activeDays')).toBeDefined()
  })

  it('renders children prop', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      >
        <div data-testid="custom-children">Custom Content</div>
      </HabitFormFields>,
    )
    expect(screen.getByTestId('custom-children')).toBeDefined()
    expect(screen.getByText('Custom Content')).toBeDefined()
  })

  it('shows checklist section', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.checklist')).toBeDefined()
  })

  it('shows goal linking field', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('goal-linking-field')).toBeDefined()
  })

  it('shows time fields when not general and not one-time', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false, isOneTime: false })
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.dueTime')).toBeDefined()
  })

  it('shows slip alert toggle for bad habits', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    // Override watch to return isBadHabit: true
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '',
        isBadHabit: true,
        reminderEnabled: false,
        slipAlertEnabled: false,
        checklistItems: [],
        scheduledReminders: [],
      }
      return defaults[field] ?? ''
    }) as unknown as typeof formHelpers.form.watch
    const tags = createMockTags()
    renderWithProviders(
      <HabitFormFields
        formHelpers={formHelpers}
        tags={tags}
        selectedGoalIds={[]}
        atGoalLimit={false}
        onToggleGoal={vi.fn()}
        reminderTimes={[]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.slipAlert')).toBeDefined()
  })
})
