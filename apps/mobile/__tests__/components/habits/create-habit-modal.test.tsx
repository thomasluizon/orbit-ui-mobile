import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

import { CreateHabitModal } from '@/components/habits/create-habit-modal'

const TestRenderer = require('react-test-renderer')

const useWatchMock = vi.fn()
let mockHasProAccess = false
let mockFormIsValid = false

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

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { hasProAccess: mockHasProAccess } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => 'today',
}))

vi.mock('@/hooks/use-habit-form', () => ({
  useHabitForm: () => ({
    form: {
      control: { values: {} },
      reset: vi.fn(),
      setValue: vi.fn(),
      getValues: vi.fn(() => ({})),
      formState: { isDirty: false, errors: {}, get isValid() { return mockFormIsValid } },
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
    formatTimeInput: (value: string) => value,
    formatEndTimeInput: (value: string) => value,
    validateAll: vi.fn(() => null),
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
    mockFormIsValid = false
    useWatchMock.mockImplementation(({ name }: { name: string }) => {
      switch (name) {
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
            child.props.children === 'habits.createHabit',
        ).length > 0,
    )[0]

  it('disables the submit button when the shared form schema is invalid', () => {
    mockFormIsValid = false
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(findSubmit(tree.root).props.disabled).toBe(true)
  })

  it('enables the submit button when the shared form schema is valid', () => {
    mockFormIsValid = true
    const tree = renderModal(<CreateHabitModal open onClose={vi.fn()} />)
    expect(findSubmit(tree.root).props.disabled).toBe(false)
  })
})
