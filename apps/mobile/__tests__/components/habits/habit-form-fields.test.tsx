import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatHabitTimeInput } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
let mockHasProAccess = false

vi.mock('react-hook-form', () => ({
  useWatch: (args: { control: { values: Record<string, unknown> }; name: string }) =>
    useWatchMock(args),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockHasProAccess,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: () => React.createElement('View', { testID: 'habit-checklist' }),
}))

vi.mock('@/components/habits/checklist-templates', () => ({
  ChecklistTemplates: () => React.createElement('View', { testID: 'checklist-templates' }),
}))

vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: () => React.createElement('View', { testID: 'goal-linking-field' }),
}))

vi.mock('@/components/ui/app-select', () => ({
  AppSelect: () => React.createElement('View'),
}))

vi.mock('@/components/ui/app-time-picker', () => ({
  AppTimePicker: (props: Record<string, unknown>) => React.createElement('AppTimePicker', props),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => React.createElement('View'),
}))

import { HabitFormFields } from '@/components/habits/habit-form-fields'

type MockControl = {
  values: Record<string, unknown>
}

function createMockFormHelpers(
  valueOverrides?: Partial<Record<string, unknown>>,
  overrides?: Partial<HabitFormHelpers>,
): HabitFormHelpers {
  const values: Record<string, unknown> = {
    title: 'Read',
    description: '',
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
    ...valueOverrides,
  }

  const control: MockControl = { values }
  const setValue = vi.fn((field: string, value: unknown) => {
    values[field] = value
  })

  return {
    form: {
      control,
      setValue,
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
    formatTimeInput: formatHabitTimeInput,
    formatEndTimeInput: formatHabitTimeInput,
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

function findTimePickers(root: { findAll: (predicate: (node: any) => boolean) => any[] }) {
  return root.findAll(
    (node: any) =>
      node.type === 'AppTimePicker',
  )
}

describe('HabitFormFields (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasProAccess = false
    useWatchMock.mockImplementation(
      ({ control, name }: { control: MockControl; name: string }) => control.values[name],
    )
  })

  it('formats dueTime as hh:mm while typing and updates form state immediately', async () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
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
    })

    const dueTimePicker = findTimePickers(tree.root).find(
      (node: any) => node.props.accessibilityLabel === 'habits.form.dueTime',
    )

    expect(dueTimePicker).toBeTruthy()

    await TestRenderer.act(async () => {
      dueTimePicker.props.onChange('15:58')
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:58', {
      shouldDirty: true,
    })
  })

  it('formats dueEndTime as hh:mm while typing', async () => {
    const formHelpers = createMockFormHelpers({ dueTime: '09:00' })
    const tags = createMockTags()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={[]}
          atGoalLimit={false}
          onToggleGoal={vi.fn()}
          reminderTimes={[]}
          onReminderTimesChange={vi.fn()}
          defaultExpanded
        />,
      )
    })

    const dueEndTimePicker = findTimePickers(tree.root).find(
      (node: any) => node.props.accessibilityLabel === 'habits.form.dueEndTime',
    )

    expect(dueEndTimePicker).toBeTruthy()

    await TestRenderer.act(async () => {
      dueEndTimePicker.props.onChange('22:15')
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueEndTime', '22:15', {
      shouldDirty: true,
    })
  })

  it('opens a searchable emoji picker from the whole emoji field', async () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
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
    })

    const emojiTrigger = tree.root.findByProps({ accessibilityLabel: 'habits.form.emojiOpenPicker' })

    await TestRenderer.act(async () => {
      emojiTrigger.props.onPress()
    })

    const searchInput = tree.root.findByProps({ accessibilityLabel: 'habits.form.emojiSearchPlaceholder' })

    await TestRenderer.act(async () => {
      searchInput.props.onChangeText('run')
    })

    const runEmoji = tree.root.findByProps({ accessibilityLabel: 'habits.form.emoji: 🏃' })

    await TestRenderer.act(async () => {
      runEmoji.props.onPress()
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '🏃', {
      shouldDirty: true,
    })
  })

  it('hides goal linking for free users', async () => {
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={[]}
          atGoalLimit={false}
          onToggleGoal={vi.fn()}
          reminderTimes={[]}
          onReminderTimesChange={vi.fn()}
          defaultExpanded
        />,
      )
    })

    expect(tree.root.findAllByProps({ testID: 'goal-linking-field' })).toHaveLength(0)
  })

  it('shows goal linking for pro users', async () => {
    mockHasProAccess = true
    const formHelpers = createMockFormHelpers()
    const tags = createMockTags()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={[]}
          atGoalLimit={false}
          onToggleGoal={vi.fn()}
          reminderTimes={[]}
          onReminderTimesChange={vi.fn()}
          defaultExpanded
        />,
      )
    })

    expect(tree.root.findAllByProps({ testID: 'goal-linking-field' })).toHaveLength(1)
  })
})
