import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

import { EditHabitModal } from '@/components/habits/edit-habit-modal'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
const mockFormReset = vi.fn()
const mockValidateAll = vi.fn()
const mockSuggestMutateAsync = vi.fn()
const mockSetValue = vi.fn()
const mockGetValues = vi.fn((..._args: unknown[]): unknown => ({}))
const mockSetFlexible = vi.fn()
const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowInfo = vi.fn()
const mockUpdateMutateAsync = vi.hoisted(() => vi.fn())
const mockBuildUpdateHabitRequest = vi.hoisted(() => vi.fn((...args: unknown[]): Record<string, unknown> => ({ goalIds: args[4] })))
const mockAssignTagsMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

let mockHabitDetailResult: {
  data: unknown
  isPending: boolean
  error: unknown
} = { data: null, isPending: false, error: null }

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('react-hook-form', () => ({
  useWatch: (args: { name: string }) => useWatchMock(args),
}))

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useHabitDetail: () => mockHabitDetailResult,
}))

vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({
    mutateAsync: mockAssignTagsMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mockSuggestMutateAsync, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
  }),
}))

vi.mock('@/hooks/use-dismiss-guard', () => ({
  useDismissGuard: () => ({
    canDismiss: true,
    showDiscardDialog: false,
    requestDismiss: vi.fn(),
    confirmDismiss: vi.fn(),
    cancelDismiss: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-habit-form', () => ({
  useHabitForm: () => ({
    form: {
      control: {},
      reset: mockFormReset,
      getValues: mockGetValues,
      setValue: mockSetValue,
      formState: { isDirty: false, dirtyFields: {} },
    },
    isOneTime: false,
    isGeneral: false,
    isFlexible: false,
    isRecurring: true,
    showDayPicker: false,
    showEndDate: false,
    daysList: [],
    frequencyUnits: [],
    setOneTime: vi.fn(),
    setRecurring: vi.fn(),
    setFlexible: mockSetFlexible,
    setGeneral: vi.fn(),
    toggleDay: vi.fn(),
    validateAll: mockValidateAll,
  }),
}))

vi.mock('@/hooks/use-tag-selection', () => ({
  useTagSelection: () => ({
    selectedTagIds: [],
    resetTags: vi.fn(),
  }),
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: (props: { children?: React.ReactNode }) =>
    React.createElement('HabitFormFields', props, props.children),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({
    children,
    onPress,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode
    onPress?: () => void
    onClick?: () => void
    disabled?: boolean
  }) => React.createElement('PillButton', { onPress, onClick, disabled }, children),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/lib/habit-request-builders', () => ({
  buildUpdateHabitRequest: mockBuildUpdateHabitRequest,
}))

function findSaveButton(tree: {
  root: { findAllByType: (type: string) => any[] }
}) {
  return tree.root
    .findAllByType('PillButton')
    .find((node: any) => node.props.children === 'common.save')
}

function findFieldsWrapper(tree: {
  root: { findAll: (predicate: (node: any) => boolean) => any[] }
}) {
  return tree.root.findAll(
    (node: any) => typeof node.props?.pointerEvents === 'string',
  )[0]
}

async function renderModal(relationshipFieldsLoaded = true) {
  const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
  let tree: any
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <EditHabitModal open onClose={vi.fn()} habit={habit} relationshipFieldsLoaded={relationshipFieldsLoaded} />,
    )
  })
  return tree
}

describe('EditHabitModal (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitDetailResult = { data: null, isPending: false, error: null }
    mockValidateAll.mockReturnValue(null)
    mockGetValues.mockImplementation((..._args: unknown[]): unknown => ({
      title: 'Exercise',
      description: '',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: [],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2025-01-01',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    }))
    mockUpdateMutateAsync.mockResolvedValue({})
    useWatchMock.mockImplementation(({ name }: { name: string }) =>
      name === 'title' ? 'Exercise' : undefined,
    )
  })

  const findFormFields = (tree: {
    root: { findAll: (predicate: (node: any) => boolean) => any[] }
  }) => tree.root.findAll((node: any) => node.type === 'HabitFormFields')[0]

  it('blocks the fields and disables save while the habit detail is loading', async () => {
    mockHabitDetailResult = { data: null, isPending: true, error: null }
    const tree = await renderModal()

    const wrapper = findFieldsWrapper(tree)
    expect(wrapper.props.pointerEvents).toBe('none')
    expect(findSaveButton(tree)?.props.disabled).toBe(true)
  })

  it('enables the fields and save once the habit detail has loaded', async () => {
    const tree = await renderModal()

    const wrapper = findFieldsWrapper(tree)
    expect(wrapper.props.pointerEvents).toBe('auto')
    expect(findSaveButton(tree)?.props.disabled).toBe(false)
  })

  it('sends the goal list from the explicit goal action', async () => {
    const tree = await renderModal()

    await TestRenderer.act(() => {
      findFormFields(tree).props.onToggleGoal('goal-1')
    })
    await TestRenderer.act(async () => {
      await findSaveButton(tree)?.props.onClick()
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      data: { goalIds: ['goal-1'] },
    })
  })

  it('preserves relationships that load after an editor session starts when an unrelated field is saved', async () => {
    mockBuildUpdateHabitRequest.mockReturnValueOnce({
      title: 'Exercise daily',
      goalIds: [],
      slipAlertEnabled: false,
    })
    const tree = await renderModal(false)
    await TestRenderer.act(() => {
      tree.update(
        <EditHabitModal
          open
          onClose={vi.fn()}
          habit={createMockHabit({
            id: 'h-1',
            title: 'Exercise',
            tags: [{ id: 'tag-1', name: 'Health', color: '#123456' }],
            linkedGoals: [{ id: 'goal-1', title: 'Feel better' }],
            slipAlertEnabled: true,
          })}
          relationshipFieldsLoaded
        />,
      )
    })

    await TestRenderer.act(async () => {
      await findSaveButton(tree)?.props.onClick()
    })

    expect(mockUpdateMutateAsync.mock.calls[0]![0].data).toEqual({ title: 'Exercise daily' })
    expect(mockAssignTagsMutateAsync).not.toHaveBeenCalled()
  })

  it('resets the form from the habit when it opens', async () => {
    await renderModal()
    expect(mockFormReset).toHaveBeenCalled()
  })

  it('applies emoji, schedule, and a checklist from an AI suggestion in edit mode', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🏊',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '07:00',
      subHabits: [],
      checklistItems: ['Towel', 'Goggles'],
    })

    const tree = await renderModal()
    mockSetValue.mockClear()
    mockSetFlexible.mockClear()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockSetFlexible).toHaveBeenCalled()
    expect(mockSetValue).toHaveBeenCalledWith('emoji', '🏊', { shouldDirty: true })
    expect(mockSetValue).toHaveBeenCalledWith('dueTime', '07:00', {
      shouldDirty: true,
    })
    expect(mockSetValue).toHaveBeenCalledWith(
      'checklistItems',
      [
        { text: 'Towel', isChecked: false },
        { text: 'Goggles', isChecked: false },
      ],
      { shouldDirty: true },
    )
    expect(mockShowSuccess).toHaveBeenCalledWith('habits.form.aiSuggestApplied')
  })

  it('shows the empty toast when the AI suggestion applies nothing', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: null,
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    const tree = await renderModal()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockShowInfo).toHaveBeenCalledWith('habits.form.aiSuggestEmpty')
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('shows the limit-reached toast when the suggestion hits the pay gate', async () => {
    mockGetValues.mockImplementation((field?: unknown) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockRejectedValue({ data: { errorCode: 'PAY_GATE' } })

    const tree = await renderModal()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockShowError).toHaveBeenCalledWith('habits.form.aiSuggestLimitReached')
  })

  it('applies a recurring cadence with weekdays from an AI suggestion in edit mode', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Walk'
      if (field === 'checklistItems') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🚶',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday', 'Wednesday'],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: '08:00',
      subHabits: [],
      checklistItems: [],
    })

    const tree = await renderModal()
    mockSetValue.mockClear()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockSetValue).toHaveBeenCalledWith('days', ['Monday', 'Wednesday'], {
      shouldDirty: true,
    })
    expect(mockSetValue).toHaveBeenCalledWith('dueTime', '08:00', {
      shouldDirty: true,
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('habits.form.aiSuggestApplied')
  })
})
