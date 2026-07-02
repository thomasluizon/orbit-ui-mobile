import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'


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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

let mockHasProAccess = false

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockHasProAccess,
  useProfile: () => ({
    profile: {
      uses24HourClock: true,
      timeZone: 'America/Sao_Paulo',
    },
  }),
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

vi.mock('@/app/actions/tags', () => ({
  getTags: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  assignTags: vi.fn(),
  suggestTags: vi.fn(),
}))


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
    tagValidationErrorKey: null,
    toggleTag: vi.fn(),
    resetTags: vi.fn(),
    showNewTag: false,
    setShowNewTag: vi.fn(),
    newTagName: '',
    setNewTagName: vi.fn(),
    newTagColor: '#7f46f7',
    setNewTagColor: vi.fn(),
    tagColors: ['#7f46f7', '#dc2626', '#047857'] as readonly string[],
    createAndSelectTag: vi.fn(),
    acceptSuggestedTag: vi.fn(),
    editingTagId: null,
    editTagName: '',
    setEditTagName: vi.fn(),
    editTagColor: '#7f46f7',
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function selectTimeInPicker(triggerLabel: string, hour24: number, minute: number) {
  fireEvent.click(screen.getByLabelText(triggerLabel))
  const hours = screen.getByRole('listbox', { name: 'common.hours' })
  fireEvent.click(within(hours).getByRole('option', { name: pad(hour24) }))
  const minutes = screen.getByRole('listbox', { name: 'common.minutes' })
  fireEvent.click(within(minutes).getByRole('option', { name: pad(minute) }))
  fireEvent.click(screen.getByText('common.done'))
}


describe('HabitFormFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasProAccess = false
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

  it('opens a searchable emoji picker from the whole emoji field', async () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers()
    formHelpers.form.setValue = setValue
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

    fireEvent.click(screen.getByLabelText('habits.form.emojiOpenPicker'))
    expect(screen.getByText('habits.form.emojiPickerTitle')).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText('habits.form.emojiSearchPlaceholder'), {
      target: { value: 'run' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🏃' }))

    expect(setValue).toHaveBeenCalledWith('emoji', '🏃', { shouldDirty: true })
    await waitFor(() =>
      expect(screen.queryByText('habits.form.emojiPickerTitle')).toBeNull(),
    )
  })

  it('filters emojis by category when clicking a category chip', () => {
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

    fireEvent.click(screen.getByLabelText('habits.form.emojiOpenPicker'))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiCategoryNature' }))

    expect(screen.getByRole('option', { name: 'habits.form.emoji: 🌱' })).toBeDefined()
    expect(screen.queryByRole('option', { name: 'habits.form.emoji: 🏃' })).toBeNull()
  })

  it('clears the selected emoji from the picker remove button', async () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers()
    formHelpers.form.setValue = setValue
    const baseWatch = formHelpers.form.watch as unknown as (field: string) => unknown
    formHelpers.form.watch = ((field: string) =>
      field === 'emoji' ? '🏃' : baseWatch(field)) as typeof formHelpers.form.watch
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

    fireEvent.click(screen.getByLabelText('habits.form.emojiOpenPicker'))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))

    expect(setValue).toHaveBeenCalledWith('emoji', '', { shouldDirty: true })
    await waitFor(() =>
      expect(screen.queryByText('habits.form.emojiPickerTitle')).toBeNull(),
    )
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

  it('shows the habit type toggle', () => {
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
    expect(screen.getByText('habits.form.habitTypeBuild')).toBeDefined()
    expect(screen.getByText('habits.form.habitTypeAvoid')).toBeDefined()
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
    mockHasProAccess = true
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

  it('writes dueTime directly from the time picker on change', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({
      isGeneral: false,
      isOneTime: false,
    })
    formHelpers.form.setValue = setValue
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

    selectTimeInPicker('habits.form.dueTime', 15, 58)

    expect(setValue).toHaveBeenCalledWith('dueTime', '15:58', { shouldDirty: true })
  })

  it('writes dueEndTime directly from the time picker on change', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({
      isGeneral: false,
    })
    formHelpers.form.setValue = setValue
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '09:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
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

    selectTimeInPicker('habits.form.dueEndTime', 22, 15)

    expect(setValue).toHaveBeenCalledWith('dueEndTime', '22:15', { shouldDirty: true })
  })

  it('shows slip alert toggle for bad habits', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
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


  it('calls setOneTime when one-time button is clicked', () => {
    const setOneTime = vi.fn()
    const formHelpers = createMockFormHelpers({ setOneTime })
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
    const btn = screen.getByText('habits.form.oneTimeTask')
    fireEvent.click(btn)
    expect(setOneTime).toHaveBeenCalled()
  })

  it('calls setRecurring when recurring button is clicked', () => {
    const setRecurring = vi.fn()
    const formHelpers = createMockFormHelpers({ setRecurring })
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
    const btn = screen.getByText('habits.form.recurring')
    fireEvent.click(btn)
    expect(setRecurring).toHaveBeenCalled()
  })

  it('calls setFlexible when flexible button is clicked', () => {
    const setFlexible = vi.fn()
    const formHelpers = createMockFormHelpers({ setFlexible })
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
    const btn = screen.getByText('habits.form.flexible')
    fireEvent.click(btn)
    expect(setFlexible).toHaveBeenCalled()
  })

  it('calls setGeneral when general button is clicked', () => {
    const setGeneral = vi.fn()
    const formHelpers = createMockFormHelpers({ setGeneral })
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
    const btn = screen.getByText('habits.form.general')
    fireEvent.click(btn)
    expect(setGeneral).toHaveBeenCalled()
  })

  it('advances to the next frequency card when the next arrow is clicked', () => {
    const setFlexible = vi.fn()
    const formHelpers = createMockFormHelpers({ setFlexible })
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
    fireEvent.click(screen.getByLabelText('common.next'))
    expect(setFlexible).toHaveBeenCalled()
  })

  it('moves to the previous frequency card when the previous arrow is clicked', () => {
    const setOneTime = vi.fn()
    const formHelpers = createMockFormHelpers({ setOneTime })
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
    fireEvent.click(screen.getByLabelText('common.previous'))
    expect(setOneTime).toHaveBeenCalled()
  })

  it('disables the previous arrow on the first frequency card', () => {
    const formHelpers = createMockFormHelpers({ isOneTime: true, isRecurring: false })
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
    expect(screen.getByLabelText('common.previous')).toBeDisabled()
    expect(screen.getByLabelText('common.next')).not.toBeDisabled()
  })

  it('disables the next arrow on the last frequency card', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: true, isRecurring: false })
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
    expect(screen.getByLabelText('common.next')).toBeDisabled()
    expect(screen.getByLabelText('common.previous')).not.toBeDisabled()
  })

  it('debounces carousel scroll so a programmatic scroll cannot instantly revert the frequency type', () => {
    vi.useFakeTimers()
    try {
      const setOneTime = vi.fn()
      const formHelpers = createMockFormHelpers({ isRecurring: true, setOneTime })
      const tags = createMockTags()
      const { container } = renderWithProviders(
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
      const track = container.querySelector(
        '[data-testid="frequency-carousel-track"]',
      ) as HTMLElement
      Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true })
      Object.defineProperty(track, 'scrollLeft', { value: 0, writable: true, configurable: true })
      Object.defineProperty(track, 'scrollTo', { value: vi.fn(), configurable: true })

      fireEvent.scroll(track)
      expect(setOneTime).not.toHaveBeenCalled()

      vi.advanceTimersByTime(200)
      expect(setOneTime).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })


  it('hides frequency picker and day picker for one-time habits', () => {
    const formHelpers = createMockFormHelpers({ isOneTime: true, isRecurring: false, showDayPicker: false, showEndDate: false })
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
    expect(screen.queryByText('habits.form.every')).toBeNull()
    expect(screen.queryByText('habits.form.activeDays')).toBeNull()
  })


  it('hides due date, due time, and bad habit toggle for general habits', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: true, isOneTime: false, isRecurring: false, isFlexible: false, showDayPicker: false, showEndDate: false })
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
    expect(screen.queryByText('habits.form.dueDate')).toBeNull()
    expect(screen.queryByText('habits.form.dueTime')).toBeNull()
    expect(screen.queryByText('habits.form.habitTypeAvoid')).toBeNull()
  })


  it('shows flexible description when isFlexible is true', () => {
    const formHelpers = createMockFormHelpers({ isFlexible: true, isOneTime: false, isGeneral: false, isRecurring: false })
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
    expect(screen.getByText('habits.form.timesPerUnit')).toBeDefined()
  })


  it('shows frequency picker for recurring habits', () => {
    const formHelpers = createMockFormHelpers({ isOneTime: false, isGeneral: false, isRecurring: true })
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
    expect(screen.getByText('habits.form.every')).toBeDefined()
    expect(screen.getAllByText('habits.form.unit').length).toBeGreaterThan(0)
  })


  it('calls toggleDay when a day button is clicked', () => {
    const toggleDay = vi.fn()
    const formHelpers = createMockFormHelpers({ showDayPicker: true, isGeneral: false, toggleDay })
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
    const monBtn = screen.getByText('Mon')
    fireEvent.click(monBtn)
    expect(toggleDay).toHaveBeenCalledWith('Monday')
  })

  it('highlights selected days', () => {
    const formHelpers = createMockFormHelpers({ showDayPicker: true, isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Week',
        frequencyQuantity: 1,
        days: ['Monday', 'Wednesday'],
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
    const monBtn = screen.getByText('Mon')
    expect(monBtn).toHaveAttribute('aria-pressed', 'true')
    const wedBtn = screen.getByText('Wed')
    expect(wedBtn).toHaveAttribute('aria-pressed', 'true')
    const tueBtn = screen.getByText('Tue')
    expect(tueBtn).toHaveAttribute('aria-pressed', 'false')
  })


  it('calls setValue on due time change', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({ isGeneral: false, isOneTime: false })
    formHelpers.form.setValue = setValue
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
    selectTimeInPicker('habits.form.dueTime', 14, 30)
    expect(setValue).toHaveBeenCalledWith('dueTime', '14:30', { shouldDirty: true })
  })


  it('shows end time field when dueTime is set', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false, isOneTime: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '14:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
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
    expect(screen.getByText('habits.form.dueEndTime')).toBeDefined()
  })


  it('does not show inline invalid time error for malformed dueTime', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '25:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
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
    expect(screen.queryByText('habits.form.invalidTime')).toBeNull()
  })

  it('does not show inline end time ordering error when end time is before start time', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '14:00',
        dueEndTime: '13:00',
        endDate: '',
        isBadHabit: false,
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
    expect(screen.queryByText('habits.form.endTimeBeforeStartTime')).toBeNull()
  })


  it('shows add end date button when endDate is empty and showEndDate is true', () => {
    const formHelpers = createMockFormHelpers({ showEndDate: true })
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
    expect(screen.getByText('habits.form.addEndDate')).toBeDefined()
  })

  it('shows end date picker when endDate is set', () => {
    const formHelpers = createMockFormHelpers({ showEndDate: true })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '2025-02-01',
        isBadHabit: false,
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
    expect(screen.getByText('habits.form.endDate')).toBeDefined()
    expect(screen.getByText('habits.form.endDateHint')).toBeDefined()
  })

  it('keeps end date messaging neutral when endDate is before dueDate', () => {
    const formHelpers = createMockFormHelpers({ showEndDate: true })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-03-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '2025-01-01',
        isBadHabit: false,
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
    expect(screen.queryByText('habits.form.endDateBeforeDueDate')).toBeNull()
    expect(screen.getByText('habits.form.endDateHint')).toBeDefined()
  })

  it('clears endDate when remove button is clicked', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({ showEndDate: true })
    formHelpers.form.setValue = setValue
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '2025-02-01',
        isBadHabit: false,
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
    const removeBtn = screen.getByLabelText('habits.form.removeEndDate')
    fireEvent.click(removeBtn)
    expect(setValue).toHaveBeenCalledWith('endDate', '', { shouldDirty: true })
  })


  it('shows reminder section when dueTime is set and not general', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '09:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
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
    expect(screen.getByText('habits.form.reminder')).toBeDefined()
  })

  it('shows reminder chips and add button when reminder is enabled', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '09:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
        reminderEnabled: true,
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
        reminderTimes={[15, 30]}
        onReminderTimesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('habits.form.reminderAdd')).toBeDefined()
    expect(screen.getByText('habits.form.reminder15min')).toBeDefined()
    expect(screen.getByText('habits.form.reminder30min')).toBeDefined()
  })

  it('toggles reminderEnabled when switch is clicked', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.setValue = setValue
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '09:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
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
    const toggle = screen.getByRole('switch', { checked: false })
    fireEvent.click(toggle)
    expect(setValue).toHaveBeenCalledWith('reminderEnabled', true, { shouldDirty: true })
  })

  it('removes a reminder chip when remove button is clicked', () => {
    const onReminderTimesChange = vi.fn()
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '09:00',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
        reminderEnabled: true,
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
        reminderTimes={[15, 30]}
        onReminderTimesChange={onReminderTimesChange}
      />,
    )
    const removeBtns = screen.getAllByLabelText('habits.form.removeReminder')
    fireEvent.click(removeBtns[0]!)
    expect(onReminderTimesChange).toHaveBeenCalledWith([30])
  })


  it('shows scheduled reminder section when dueTime is empty and not general', () => {
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
    expect(screen.getByText('habits.form.scheduledReminder')).toBeDefined()
  })

  it('shows scheduled reminder add button when enabled', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
        reminderEnabled: true,
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
    expect(screen.getByText('habits.form.scheduledReminderAdd')).toBeDefined()
  })

  it('renders existing scheduled reminder chips', () => {
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        days: [],
        dueDate: '2025-01-01',
        dueTime: '',
        dueEndTime: '',
        endDate: '',
        isBadHabit: false,
        reminderEnabled: true,
        slipAlertEnabled: false,
        checklistItems: [],
        scheduledReminders: [
          { when: 'same_day', time: '08:00' },
          { when: 'day_before', time: '20:00' },
        ],
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
    expect(screen.getByText(/scheduledReminderSameDayAt/)).toBeDefined()
    expect(screen.getByText(/scheduledReminderDayBeforeAt/)).toBeDefined()
  })


  it('sets isBadHabit from the habit type segmented toggle', () => {
    const setValue = vi.fn()
    const formHelpers = createMockFormHelpers({ isGeneral: false })
    formHelpers.form.setValue = setValue
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
    fireEvent.click(screen.getByText('habits.form.habitTypeAvoid'))
    expect(setValue).toHaveBeenCalledWith('isBadHabit', true, { shouldDirty: true })
    fireEvent.click(screen.getByText('habits.form.habitTypeBuild'))
    expect(setValue).toHaveBeenCalledWith('isBadHabit', false, { shouldDirty: true })
  })


  it('shows slip alert toggle switch when bad habit and pro access', () => {
    mockHasProAccess = true
    const formHelpers = createMockFormHelpers({ isGeneral: false })
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
    expect(screen.queryByText('common.proBadge')).not.toBeInTheDocument()
    expect(screen.getByText('habits.form.slipAlertDescription')).toBeDefined()
    expect(screen.getByRole('switch', { name: 'habits.form.slipAlert' })).toBeDefined()
  })


  it('shows new tag button when showNewTag is false and not at limit', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags({ showNewTag: false, atTagLimit: false })
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
    expect(screen.getByText(/habits.form.newTag/)).toBeDefined()
  })

  it('hides new tag button when at tag limit', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags({ atTagLimit: true })
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
    expect(screen.queryByText(/habits.form.newTag/)).toBeNull()
  })

  it('shows new tag form when showNewTag is true', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags({ showNewTag: true })
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
    expect(screen.getByPlaceholderText('habits.form.tagName')).toBeDefined()
    expect(screen.getByText('common.add')).toBeDefined()
  })

  it('shows tag edit form when editingTagId is set', () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags({ editingTagId: 'tag-1', editTagName: 'Work' })
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
    expect(screen.getByText('common.save')).toBeDefined()
  })


  it('shows due date for non-general habits', () => {
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
    expect(screen.getByText('habits.form.dueDate')).toBeDefined()
  })


  it('renders checklist and checklist templates', () => {
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
    expect(screen.getByTestId('habit-checklist')).toBeDefined()
    expect(screen.getByTestId('checklist-templates')).toBeDefined()
  })

  it('disables the suggest tags button when the title is empty', () => {
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
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
  })

  it('suggests tags and accepts an existing suggestion as the real tag', async () => {
    const { suggestTags } = await import('@/app/actions/tags')
    vi.mocked(suggestTags).mockResolvedValue({
      tags: [
        { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-1' },
        { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
      ],
    })

    const formHelpers = createMockFormHelpers()
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        title: 'Morning run',
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
    }) as unknown as typeof formHelpers.form.watch
    const acceptSuggestedTag = vi.fn()
    const tags = createMockTags({ acceptSuggestedTag })

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

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))

    const healthChip = await screen.findByText('Health')
    fireEvent.click(healthChip)

    expect(acceptSuggestedTag).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Health', isExisting: true, id: 'tag-1' }),
      expect.any(Function),
    )
  })

  it('shows the empty state when no tag suggestions are returned', async () => {
    const { suggestTags } = await import('@/app/actions/tags')
    vi.mocked(suggestTags).mockResolvedValue({ tags: [] })

    const formHelpers = createMockFormHelpers()
    formHelpers.form.watch = vi.fn((field: string) => {
      const defaults: Record<string, unknown> = {
        title: 'Morning run',
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

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))

    expect(await screen.findByText('habits.form.noTagSuggestions')).toBeDefined()
  })
})
