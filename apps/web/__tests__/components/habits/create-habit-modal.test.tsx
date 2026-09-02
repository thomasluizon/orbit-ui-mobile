import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitFormProposal } from '@orbit/shared/utils'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'


const mockCreateMutateAsync = vi.fn()
const mockCreateSubMutateAsync = vi.fn()
const mockSuggestMutateAsync = vi.fn()
const mockFormReset = vi.fn()
const mockFormSetValue = vi.fn()
const mockFormGetValues = vi.fn()
const mockFormWatch = vi.fn()
const mockFormRegister = vi.fn(() => ({ name: 'test', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() }))
const mockSetFlexible = vi.fn()
const mockValidateAll = vi.fn()
const mockResetTags = vi.fn()
const mockShowError = vi.fn()
const mockPush = vi.fn()
const mockBuildCreateHabitRequest = vi.hoisted(() => vi.fn(
  (_form: unknown, _reminders: unknown, _tags: unknown, _goals: unknown, _subHabits: unknown) => ({}),
))
const mockProfileState = vi.hoisted(() => ({ hasProAccess: true }))
const mockHabitFormFieldsState = vi.hoisted(() => ({
  onSuggestSetup: undefined as undefined | (() => HabitFormProposal | null | Promise<HabitFormProposal | null>),
  onSuggestionContextChange: undefined as undefined | (() => void),
}))

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
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
    error: null,
  }),
  useCreateSubHabit: () => ({
    mutateAsync: mockCreateSubMutateAsync,
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({
    profile: { hasProAccess: mockProfileState.hasProAccess },
  }),
}))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))

vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({
    mutateAsync: mockSuggestMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-habit-form', () => ({
  useHabitForm: () => ({
    form: {
      reset: mockFormReset,
      setValue: mockFormSetValue,
      getValues: mockFormGetValues,
      watch: mockFormWatch,
      register: mockFormRegister,
      formState: { isValid: true },
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
    formatTimeInput: vi.fn((v: string) => v),
    formatEndTimeInput: vi.fn((v: string) => v),
    validateAll: mockValidateAll,
  }),
}))

vi.mock('@/hooks/use-tag-selection', () => ({
  useTagSelection: () => ({
    selectedTagIds: [],
    atTagLimit: false,
    toggleTag: vi.fn(),
    resetTags: mockResetTags,
    showNewTag: false,
    setShowNewTag: vi.fn(),
    newTagName: '',
    setNewTagName: vi.fn(),
    newTagColor: '#C4530F',
    setNewTagColor: vi.fn(),
    tagColors: ['#C4530F'],
  }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => 'today',
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
  }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    formatAPIDate: () => '2025-01-01',
  }
})

vi.mock('@/lib/habit-request-builders', () => ({
  buildCreateHabitRequest: mockBuildCreateHabitRequest,
  buildSubHabitRequest: vi.fn(() => ({})),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('./habit-form-fields', () => ({
  HabitFormFields: ({
    children,
    onSuggestSetup,
    onSuggestionContextChange,
    onToggleGoal,
  }: {
    children?: React.ReactNode | ((proposedItems: number) => React.ReactNode)
    onSuggestSetup?: () => HabitFormProposal | null | Promise<HabitFormProposal | null>
    onSuggestionContextChange?: () => void
    onToggleGoal: (goalId: string) => void
  }) => {
    mockHabitFormFieldsState.onSuggestSetup = onSuggestSetup
    mockHabitFormFieldsState.onSuggestionContextChange = onSuggestionContextChange
    return (
      <div data-testid="habit-form-fields">
        {onSuggestSetup && (
          <button type="button" data-testid="suggest-trigger" onClick={() => { void onSuggestSetup() }}>
            suggest
          </button>
        )}
        <button type="button" data-testid="goal-trigger" onClick={() => onToggleGoal('goal-free')}>
          goal
        </button>
        {typeof children === 'function' ? children(0) : children}
      </div>
    )
  },
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: ({
    children,
    onSuggestSetup,
    onSuggestionContextChange,
    onToggleGoal,
  }: {
    children?: React.ReactNode | ((proposedItems: number) => React.ReactNode)
    onSuggestSetup?: () => HabitFormProposal | null | Promise<HabitFormProposal | null>
    onSuggestionContextChange?: () => void
    onToggleGoal: (goalId: string) => void
  }) => {
    mockHabitFormFieldsState.onSuggestSetup = onSuggestSetup
    mockHabitFormFieldsState.onSuggestionContextChange = onSuggestionContextChange
    return (
      <div data-testid="habit-form-fields">
        {onSuggestSetup && (
          <button type="button" data-testid="suggest-trigger" onClick={() => { void onSuggestSetup() }}>
            suggest
          </button>
        )}
        <button type="button" data-testid="goal-trigger" onClick={() => onToggleGoal('goal-free')}>
          goal
        </button>
        {typeof children === 'function' ? children(0) : children}
      </div>
    )
  },
}))


function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}


describe('CreateHabitModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitFormFieldsState.onSuggestSetup = undefined
    mockProfileState.hasProAccess = true
    mockCreateMutateAsync.mockResolvedValue({})
    mockCreateSubMutateAsync.mockResolvedValue({})
    mockValidateAll.mockReturnValue(null)
    mockFormWatch.mockImplementation((field?: string) => {
      switch (field) {
        case 'title':
          return 'Test Habit'
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
    mockFormGetValues.mockReturnValue({
      title: 'Test Habit',
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
    })
  })

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <CreateHabitModal open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the overlay when open', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByTestId('sheet')).toBeDefined()
  })

  it('shows create habit title', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    const matches = screen.getAllByText('habits.createHabit')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('shows create sub-habit title when parentHabit is provided', () => {
    const parent = createMockHabit({ id: 'parent-1', title: 'Parent' })
    renderWithProviders(
      <CreateHabitModal
        open={true}
        onOpenChange={vi.fn()}
        parentHabit={parent}
      />,
    )
    const texts = screen.getAllByText('habits.createSubHabit')
    expect(texts.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the form fields', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByTestId('habit-form-fields')).toBeDefined()
  })

  it('renders named cancel and create actions', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'common.create' })).toBeDefined()
  })

  it('submits through the named Create footer action', async () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(mockSuggestMutateAsync).not.toHaveBeenCalled()
  })

  it('omits nested sub-habits from a Free create request', async () => {
    mockProfileState.hasProAccess = false
    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.addSubHabit' }))
    fireEvent.change(
      screen.getByLabelText('habits.form.subHabitInputLabel({"index":1})'),
      { target: { value: 'Warm up' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(mockBuildCreateHabitRequest).toHaveBeenCalled())
    expect(mockBuildCreateHabitRequest.mock.calls[0]?.[4]).toEqual([])
  })

  it('routes a Free standalone sub-habit attempt to upgrade without calling the API', async () => {
    mockProfileState.hasProAccess = false
    const onOpenChange = vi.fn()
    renderWithProviders(
      <CreateHabitModal
        open={true}
        onOpenChange={onOpenChange}
        parentHabit={createMockHabit({ id: 'parent-1' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/upgrade'))
    expect(mockCreateSubMutateAsync).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps goal linking in the create request without a plan gate', async () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByTestId('goal-trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => {
      expect(mockValidateAll).toHaveBeenCalledWith(expect.objectContaining({
        selectedGoalIds: ['goal-free'],
      }))
    })
  })

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn()
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={onOpenChange} />,
    )
    fireEvent.click(screen.getByText('common.cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows sub-habits section when not in sub-habit mode', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('habits.form.subHabits')).toBeDefined()
    expect(screen.getByText('habits.form.addSubHabit')).toBeDefined()
  })

  it('hides sub-habits section when in sub-habit mode', () => {
    const parent = createMockHabit()
    renderWithProviders(
      <CreateHabitModal
        open={true}
        onOpenChange={vi.fn()}
        parentHabit={parent}
      />,
    )
    expect(screen.queryByText('habits.form.subHabits')).toBeNull()
  })

  it('shows validation error when form validation fails', () => {
    mockValidateAll.mockReturnValue('Validation failed!')
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    const form = screen.getByTestId('sheet').querySelector('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('Validation failed!')
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
    expect(mockCreateSubMutateAsync).not.toHaveBeenCalled()
  })

  it('resets form when modal opens', async () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    await waitFor(() => {
      expect(mockFormReset).toHaveBeenCalled()
      expect(mockResetTags).toHaveBeenCalled()
    })
  })

  it('auto-enables reminders when a due time is present in create mode', () => {
    mockFormWatch.mockImplementation((field?: string) => {
      switch (field) {
        case 'dueTime':
          return '09:00'
        case 'reminderEnabled':
          return false
        case 'scheduledReminders':
          return []
        default:
          return undefined
      }
    })

    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )

    expect(mockFormSetValue).toHaveBeenCalledWith('reminderEnabled', true, {
      shouldDirty: true,
    })
  })

  it('auto-disables reminders when due time is cleared and there are no scheduled reminders', () => {
    mockFormWatch.mockImplementation((field?: string) => {
      switch (field) {
        case 'dueTime':
          return ''
        case 'reminderEnabled':
          return true
        case 'scheduledReminders':
          return []
        default:
          return undefined
      }
    })

    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )

    expect(mockFormSetValue).toHaveBeenCalledWith('reminderEnabled', false, {
      shouldDirty: true,
    })
  })

  it('applies due time, flexible cadence, and a checklist from an AI suggestion', async () => {
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      return { title: 'Swim', checklistItems: [] }
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

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    let proposal: HabitFormProposal | null | undefined
    await act(async () => {
      proposal = await mockHabitFormFieldsState.onSuggestSetup?.()
    })

    expect(mockSetFlexible).toHaveBeenCalled()
    expect(mockFormSetValue).toHaveBeenCalledWith('dueTime', '07:00', { shouldDirty: true })
    expect(mockFormSetValue).toHaveBeenCalledWith(
      'checklistItems',
      [
        { text: 'Towel', isChecked: false },
        { text: 'Goggles', isChecked: false },
      ],
      { shouldDirty: true },
    )
    expect(proposal).toEqual({ setup: true, checklist: true, subHabits: false, checklistItems: 2, subHabitItems: 0 })
  })

  it('does not attribute a pre-existing checklist when Astra changes only setup', async () => {
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Run'
      if (field === 'checklistItems') return [{ text: 'Shoes', isChecked: false }]
      return undefined
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🏃',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    let proposal: HabitFormProposal | null | undefined
    await act(async () => {
      proposal = await mockHabitFormFieldsState.onSuggestSetup?.()
    })

    expect(proposal).toEqual({ setup: true, checklist: false, subHabits: false, checklistItems: 0, subHabitItems: 0 })
    expect(mockFormSetValue).not.toHaveBeenCalledWith('checklistItems', expect.anything(), expect.anything())
  })

  it('preserves a sub-habit edit made while an Astra suggestion is pending', async () => {
    let resolveSuggestion!: (suggestion: HabitSetupSuggestion) => void
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Run'
      if (field === 'checklistItems') return []
      return undefined
    })
    mockSuggestMutateAsync.mockImplementation(() => new Promise<HabitSetupSuggestion>((resolve) => {
      resolveSuggestion = resolve
    }))

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.addSubHabit' }))

    const onSuggestSetup = mockHabitFormFieldsState.onSuggestSetup
    if (!onSuggestSetup) throw new Error('Expected the suggestion handler')
    let proposalPromise!: Promise<HabitFormProposal | null>
    act(() => {
      proposalPromise = Promise.resolve(onSuggestSetup())
    })
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())
    fireEvent.change(
      screen.getByLabelText('habits.form.subHabitInputLabel({"index":1})'),
      { target: { value: 'Edited while pending' } },
    )

    let proposal: HabitFormProposal | null | undefined
    await act(async () => {
      resolveSuggestion({
        emoji: null,
        frequencyUnit: null,
        frequencyQuantity: null,
        days: [],
        isFlexible: false,
        flexibleTarget: null,
        dueTime: null,
        subHabits: ['Suggested stretch'],
        checklistItems: [],
      })
      proposal = await proposalPromise
    })

    expect(screen.getByDisplayValue('Edited while pending')).toBeDefined()
    expect(screen.getByDisplayValue('Suggested stretch')).toBeDefined()
    expect(proposal).toEqual({ setup: true, checklist: false, subHabits: true, checklistItems: 0, subHabitItems: 1 })
  })

  it('ignores a pending Astra suggestion after the title changes', async () => {
    let title = 'Run'
    let resolveSuggestion!: (suggestion: HabitSetupSuggestion) => void
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return title
      if (field === 'checklistItems') return []
      return undefined
    })
    mockSuggestMutateAsync.mockImplementation(() => new Promise<HabitSetupSuggestion>((resolve) => {
      resolveSuggestion = resolve
    }))

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    const onSuggestSetup = mockHabitFormFieldsState.onSuggestSetup
    if (!onSuggestSetup) throw new Error('Expected the suggestion handler')
    let proposalPromise!: Promise<HabitFormProposal | null>
    act(() => {
      proposalPromise = Promise.resolve(onSuggestSetup())
    })
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())
    mockFormSetValue.mockClear()
    mockSetFlexible.mockClear()

    title = 'Walk'
    act(() => mockHabitFormFieldsState.onSuggestionContextChange?.())

    let proposal: HabitFormProposal | null | undefined
    await act(async () => {
      resolveSuggestion({
        emoji: '🏃',
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
        days: [],
        isFlexible: true,
        flexibleTarget: 2,
        dueTime: '07:00',
        subHabits: ['Old step'],
        checklistItems: ['Old checklist'],
      })
      proposal = await proposalPromise
    })

    expect(proposal).toBeNull()
    expect(mockSetFlexible).not.toHaveBeenCalled()
    expect(mockFormSetValue).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Old step')).not.toBeInTheDocument()
  })
})
