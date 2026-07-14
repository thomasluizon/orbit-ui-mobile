import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

import { CreateHabitModal } from '@/components/habits/create-habit-modal'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
const mockSuggestMutateAsync = vi.fn()
const mockSetValue = vi.fn()
const mockGetValues = vi.fn((..._args: unknown[]): unknown => ({}))
const mockSetFlexible = vi.fn()
const mockCreateMutateAsync = vi.fn()
const mockCreateSubMutateAsync = vi.fn()
const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowInfo = vi.fn()
const mockValidateAll = vi.fn((): string | null => null)
const mockPush = vi.fn()
let mockHasProAccess = false

vi.mock('react-hook-form', () => ({
  useWatch: (args: { control: { values: Record<string, unknown> }; name: string }) =>
    useWatchMock(args),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: mockCreateSubMutateAsync, isPending: false }),
}))

vi.mock('@orbit/shared/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/validation')>()
  return {
    ...actual,
    habitFormSchema: { parse: (value: unknown) => value },
  }
})

vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mockSuggestMutateAsync, isPending: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: mockHasProAccess } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
  }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => 'today',
}))

vi.mock('@/hooks/use-habit-form', () => ({
  useHabitForm: () => ({
    form: {
      control: { values: {} },
      reset: vi.fn(),
      setValue: mockSetValue,
      getValues: mockGetValues,
      formState: { isDirty: false, errors: {} },
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
    formatTimeInput: (value: string) => value,
    formatEndTimeInput: (value: string) => value,
    validateAll: mockValidateAll,
  }),
}))

vi.mock('@/hooks/use-tag-selection', () => ({
  useTagSelection: () => ({
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
    tagColors: ['#7f46f7'] as readonly string[],
    createAndSelectTag: vi.fn(),
    editingTagId: null,
    editTagName: '',
    setEditTagName: vi.fn(),
    editTagColor: '#7f46f7',
    setEditTagColor: vi.fn(),
    startEditTag: vi.fn(),
    saveEditTag: vi.fn(),
    cancelEditTag: vi.fn(),
    deleteTag: vi.fn(),
  }),
}))

vi.mock('@/lib/habit-request-builders', () => ({
  buildCreateHabitRequest: vi.fn(() => ({})),
  buildSubHabitRequest: vi.fn(() => ({})),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    formatAPIDate: () => '2025-01-01',
  }
})

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: (props: { children?: React.ReactNode }) =>
    React.createElement('HabitFormFields', props, props.children),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => React.createElement('ProBadge', { testID: 'pro-badge' }),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareBottomSheetScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('ScrollView', null, children),
}))

function renderModal(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let tree: { root: { findAll: (predicate: (node: any) => boolean) => any[] } }
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    )
  })
  return tree!
}

function hasText(root: { findAll: (predicate: (node: any) => boolean) => any[] }, value: string) {
  return (
    root.findAll(
      (node: any) => node.type === 'Text' && node.props.children === value,
    ).length > 0
  )
}

describe('CreateHabitModal (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasProAccess = false
    mockCreateMutateAsync.mockReset()
    mockCreateMutateAsync.mockResolvedValue({})
    mockCreateSubMutateAsync.mockReset()
    mockCreateSubMutateAsync.mockResolvedValue({})
    mockSuggestMutateAsync.mockReset()
    mockValidateAll.mockReset()
    mockValidateAll.mockReturnValue(null)
    mockGetValues.mockReset()
    mockGetValues.mockImplementation((..._args: unknown[]): unknown => ({}))
    useWatchMock.mockImplementation(({ name }: { name: string }) => {
      switch (name) {
        case 'title':
          return ''
        case 'dueTime':
          return ''
        case 'reminderEnabled':
          return false
        case 'scheduledReminders':
          return []
        default:
          return undefined
      }
    })
  })

  it('renders nothing when closed', () => {
    const tree = renderModal(<CreateHabitModal open={false} onClose={vi.fn()} />)
    expect(
      tree.root.findAll((node: any) => node.type === 'BottomSheetModal'),
    ).toHaveLength(0)
  })

  it('renders the sheet titled habits.createHabit when open', () => {
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(
      tree.root.findAll((node: any) => node.type === 'BottomSheetModal'),
    ).toHaveLength(1)
    expect(hasText(tree.root, 'habits.createHabit')).toBe(true)
  })

  it('uses the sub-habit title and hides the sub-habit section in sub-habit mode', () => {
    mockHasProAccess = true
    const parentHabit = createMockHabit({ id: 'parent-1', title: 'Parent' })
    const tree = renderModal(
      <CreateHabitModal open onClose={vi.fn()} parentHabit={parentHabit} />,
    )
    expect(hasText(tree.root, 'habits.createSubHabit')).toBe(true)
    expect(hasText(tree.root, 'habits.form.subHabits')).toBe(false)
  })

  it('shows the sub-habit section with a ProBadge for non-pro users not in sub-habit mode', () => {
    mockHasProAccess = false
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(hasText(tree.root, 'habits.form.subHabits')).toBe(true)
    expect(
      tree.root.findAll((node: any) => node.props?.testID === 'pro-badge'),
    ).toHaveLength(1)
  })

  const findSubmit = (root: {
    findAll: (predicate: (node: any) => boolean) => any[]
  }) =>
    root.findAll(
      (node: any) =>
        node.type === 'Pressable' &&
        node.props.accessibilityRole === 'button' &&
        node.findAll(
          (child: any) =>
            child.type === 'Text' &&
            child.props.children === 'common.create',
        ).length > 0,
    )[0]

  it('disables the submit button until a title is entered', () => {
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(findSubmit(tree.root).props.disabled).toBe(true)
  })

  it('enables the submit button once the title has content', () => {
    useWatchMock.mockImplementation(({ name }: { name: string }) => {
      switch (name) {
        case 'title':
          return 'Drink water'
        case 'dueTime':
          return ''
        case 'reminderEnabled':
          return false
        case 'scheduledReminders':
          return []
        default:
          return undefined
      }
    })
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(findSubmit(tree.root).props.disabled).toBe(false)
  })

  it('applies due time, flexible cadence, and a checklist from an AI suggestion', async () => {
    mockHasProAccess = true
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

    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    const formFields = tree.root.findAll(
      (node: any) => node.type === 'HabitFormFields',
    )[0]

    await TestRenderer.act(async () => {
      await formFields.props.onSuggestSetup()
    })

    expect(mockSetFlexible).toHaveBeenCalled()
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
  })

  it('creates the habit and closes on a successful submit', async () => {
    const onClose = vi.fn()
    const tree = renderModal(<CreateHabitModal open onClose={onClose} />)

    await TestRenderer.act(async () => {
      findSubmit(tree.root).props.onPress()
    })

    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('surfaces the validation error and does not create when the form is invalid', async () => {
    mockValidateAll.mockReturnValue('habits.form.errors.title')
    const onClose = vi.fn()
    const tree = renderModal(<CreateHabitModal open onClose={onClose} />)

    await TestRenderer.act(async () => {
      findSubmit(tree.root).props.onPress()
    })

    expect(mockShowError).toHaveBeenCalledWith('habits.form.errors.title')
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a friendly error and stays open when creation fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('offline'))
    const onClose = vi.fn()
    const tree = renderModal(<CreateHabitModal open onClose={onClose} />)

    await TestRenderer.act(async () => {
      findSubmit(tree.root).props.onPress()
    })

    expect(mockShowError).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('redirects non-pro users out of sub-habit mode when opened', () => {
    mockHasProAccess = false
    const onClose = vi.fn()
    const parentHabit = createMockHabit({ id: 'p-1', title: 'Parent' })

    renderModal(
      <CreateHabitModal open onClose={onClose} parentHabit={parentHabit} />,
    )

    expect(onClose).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
  })

  it('notifies when an AI suggestion applied nothing', async () => {
    mockHasProAccess = true
    mockGetValues.mockImplementation((field?: unknown) =>
      field === 'title' ? 'Swim' : field === 'checklistItems' ? [] : {},
    )
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

    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    const formFields = tree.root.findAll(
      (node: any) => node.type === 'HabitFormFields',
    )[0]

    await TestRenderer.act(async () => {
      await formFields.props.onSuggestSetup()
    })

    expect(mockShowInfo).toHaveBeenCalledWith('habits.form.aiSuggestEmpty')
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('surfaces an error when the AI suggestion request fails', async () => {
    mockHasProAccess = true
    mockGetValues.mockImplementation((field?: unknown) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockRejectedValue(new Error('boom'))

    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    const formFields = tree.root.findAll(
      (node: any) => node.type === 'HabitFormFields',
    )[0]

    await TestRenderer.act(async () => {
      await formFields.props.onSuggestSetup()
    })

    expect(mockShowError).toHaveBeenCalledWith('habits.form.aiSuggestError')
  })

  it('skips the AI request when the title is empty', async () => {
    mockGetValues.mockImplementation((field?: unknown) =>
      field === 'title' ? '' : {},
    )

    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    const formFields = tree.root.findAll(
      (node: any) => node.type === 'HabitFormFields',
    )[0]

    await TestRenderer.act(async () => {
      await formFields.props.onSuggestSetup()
    })

    expect(mockSuggestMutateAsync).not.toHaveBeenCalled()
  })
})
