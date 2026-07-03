import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

import { EditHabitModal } from '@/components/habits/edit-habit-modal'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
const mockFormReset = vi.fn()
const mockValidateAll = vi.fn()

let mockHabitDetailResult: {
  data: unknown
  isPending: boolean
  error: unknown
} = { data: null, isPending: false, error: null }

vi.mock('react-hook-form', () => ({
  useWatch: (args: { name: string }) => useWatchMock(args),
}))

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useHabitDetail: () => mockHabitDetailResult,
}))

vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
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
      getValues: vi.fn(() => ({})),
      setValue: vi.fn(),
      formState: { isDirty: false },
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
    setFlexible: vi.fn(),
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
  HabitFormFields: () => React.createElement('View', { testID: 'habit-form-fields' }),
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareBottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode
    onPress?: () => void
    disabled?: boolean
  }) => React.createElement('PillButton', { onPress, disabled }, children),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/lib/habit-request-builders', () => ({
  buildUpdateHabitRequest: vi.fn(() => ({})),
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

async function renderModal() {
  const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
  let tree: any
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <EditHabitModal open onClose={vi.fn()} habit={habit} />,
    )
  })
  return tree
}

describe('EditHabitModal (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitDetailResult = { data: null, isPending: false, error: null }
    mockValidateAll.mockReturnValue(null)
    useWatchMock.mockImplementation(({ name }: { name: string }) =>
      name === 'title' ? 'Exercise' : undefined,
    )
  })

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

  it('resets the form from the habit when it opens', async () => {
    await renderModal()
    expect(mockFormReset).toHaveBeenCalled()
  })
})
