import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatHabitTimeInput } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

import { HabitFormFields } from '@/components/habits/habit-form-fields'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
const suggestMutateAsyncMock = vi.fn()
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
  useSuggestTags: () => ({ isPending: false, mutateAsync: suggestMutateAsyncMock }),
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

  it('filters emojis by category when tapping a category chip', async () => {
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

    const natureCategory = tree.root
      .findAllByProps({ accessibilityLabel: 'habits.form.emojiCategoryNature' })
      .find((node: any) => typeof node.props.onPress === 'function')

    expect(natureCategory).toBeTruthy()

    await TestRenderer.act(async () => {
      natureCategory!.props.onPress()
    })

    expect(tree.root.findByProps({ accessibilityLabel: 'habits.form.emoji: 🌱' })).toBeTruthy()
    expect(tree.root.findAllByProps({ accessibilityLabel: 'habits.form.emoji: 🏃' })).toHaveLength(0)
  })

  it('clears the selected emoji from the picker remove button', async () => {
    const formHelpers = createMockFormHelpers({ emoji: '🏃' })
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

    const removeButton = tree.root
      .findAllByProps({ accessibilityLabel: 'habits.form.emojiRemove' })
      .find((node: any) => typeof node.props.onPress === 'function')

    expect(removeButton).toBeTruthy()

    await TestRenderer.act(async () => {
      removeButton!.props.onPress()
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '', {
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

  it('renders all field sections without crashing', async () => {
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
          reminderTimes={[30]}
          onReminderTimesChange={vi.fn()}
          defaultExpanded
        />,
      )
    })

    const hasText = (value: string) =>
      tree.root.findAll(
        (node: any) => node.type === 'Text' && node.props.children === value,
      ).length > 0

    expect(tree.root.findByProps({ accessibilityLabel: 'habits.form.title' })).toBeTruthy()
    expect(hasText('habits.form.recurring')).toBe(true)
    expect(hasText('habits.form.reminder')).toBe(true)
    expect(hasText('habits.form.tags')).toBe(true)
  })

  it('advances the frequency carousel to the next card when the next arrow is pressed', async () => {
    const setFlexible = vi.fn()
    const formHelpers = createMockFormHelpers(undefined, { setFlexible })
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

    const nextArrow = tree.root.findByProps({ accessibilityLabel: 'common.next' })

    await TestRenderer.act(async () => {
      nextArrow.props.onPress()
    })

    expect(setFlexible).toHaveBeenCalled()
  })

  it('moves the frequency carousel to the previous card when the previous arrow is pressed', async () => {
    const setOneTime = vi.fn()
    const formHelpers = createMockFormHelpers(undefined, { setOneTime })
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

    const previousArrow = tree.root.findByProps({ accessibilityLabel: 'common.previous' })

    await TestRenderer.act(async () => {
      previousArrow.props.onPress()
    })

    expect(setOneTime).toHaveBeenCalled()
  })

  it('selects the tapped frequency card instead of re-applying the active one', async () => {
    const setOneTime = vi.fn()
    const formHelpers = createMockFormHelpers(undefined, { setOneTime })
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

    const oneTimeCard = tree.root.findByProps({
      accessibilityLabel: 'habits.form.oneTimeTask',
    })

    await TestRenderer.act(async () => {
      oneTimeCard.props.onPress()
    })

    expect(setOneTime).toHaveBeenCalled()
  })

  it('commits the title to the form as it is typed so the shared schema gates submit', async () => {
    const formHelpers = createMockFormHelpers({ title: '' })
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

    const titleInput = tree.root.findAll(
      (node: any) =>
        node.type === 'TextInput' &&
        node.props.accessibilityLabel === 'habits.form.title',
    )[0]
    expect(titleInput).toBeTruthy()

    await TestRenderer.act(async () => {
      titleInput.props.onChangeText('Read a book')
    })
    expect(formHelpers.form.setValue).toHaveBeenLastCalledWith('title', 'Read a book', {
      shouldDirty: true,
    })
  })

  it('suggests tags and accepts an existing suggestion as the real tag', async () => {
    suggestMutateAsyncMock.mockResolvedValue({
      tags: [
        { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-1' },
        { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
      ],
    })
    const acceptSuggestedTag = vi.fn()
    const formHelpers = createMockFormHelpers({ title: 'Morning run' })
    const tags = createMockTags({ acceptSuggestedTag })
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

    const suggestButton = tree.root.findByProps({
      accessibilityLabel: 'habits.form.suggestTags',
    })

    await TestRenderer.act(async () => {
      await suggestButton.props.onPress()
    })

    const healthChip = tree.root.findByProps({ accessibilityLabel: 'Health' })

    await TestRenderer.act(async () => {
      healthChip.props.onPress()
    })

    expect(acceptSuggestedTag).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Health', isExisting: true, id: 'tag-1' }),
      expect.any(Function),
    )
  })

  it('shows the empty state when no tag suggestions are returned', async () => {
    suggestMutateAsyncMock.mockResolvedValue({ tags: [] })
    const formHelpers = createMockFormHelpers({ title: 'Morning run' })
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

    const suggestButton = tree.root.findByProps({
      accessibilityLabel: 'habits.form.suggestTags',
    })

    await TestRenderer.act(async () => {
      await suggestButton.props.onPress()
    })

    const emptyState = tree.root.findAll(
      (node: any) =>
        node.type === 'Text' &&
        node.props.children === 'habits.form.noTagSuggestions',
    )
    expect(emptyState.length).toBe(1)
  })

  it('sets isBadHabit from the habit type segmented toggle', async () => {
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

    const avoidSegment = tree.root
      .findAllByProps({ accessibilityLabel: 'habits.form.habitTypeAvoid' })
      .find((node: any) => typeof node.props.onPress === 'function')

    expect(avoidSegment).toBeTruthy()

    await TestRenderer.act(async () => {
      avoidSegment!.props.onPress()
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('isBadHabit', true, {
      shouldDirty: true,
    })
  })
})
