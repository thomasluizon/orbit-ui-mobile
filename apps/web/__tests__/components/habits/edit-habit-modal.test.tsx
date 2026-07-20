import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'


const mockUpdateMutateAsync = vi.fn()
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
const mockShowSuccess = vi.fn()
const mockShowInfo = vi.fn()

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

let mockHabitDetailResult: {
  data: unknown
  isPending: boolean
  error: unknown
} = { data: null, isPending: false, error: null }

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    error: null,
  }),
  useHabitDetail: () => mockHabitDetailResult,
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
    newTagColor: '#7f46f7',
    setNewTagColor: vi.fn(),
    tagColors: ['#7f46f7'],
  }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({
    mutateAsync: mockSuggestMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
  }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    getErrorMessage: (err: unknown, fallback: string) =>
      err instanceof Error ? err.message : fallback,
  }
})

vi.mock('@/lib/habit-request-builders', () => ({
  buildUpdateHabitRequest: vi.fn(() => ({})),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    title,
    description,
    footer,
  }: {
    open: boolean
    children: React.ReactNode
    title?: string
    description?: string
    footer?: React.ReactNode
  }) =>
    open ? (
      <div data-testid="app-overlay">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
        {children}
        {footer && <div data-testid="overlay-footer">{footer}</div>}
      </div>
    ) : null,
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: ({
    children,
    onSuggestSetup,
    lockedGeneral,
  }: {
    children?: React.ReactNode
    onSuggestSetup?: () => void
    lockedGeneral?: boolean | null
  }) => (
    <div data-testid="habit-form-fields">
      <span data-testid="habit-form-fields-locked-general">{String(lockedGeneral)}</span>
      {onSuggestSetup && (
        <button
          type="button"
          data-testid="suggest-trigger"
          onClick={() => onSuggestSetup()}
        >
          suggest
        </button>
      )}
      {children}
    </div>
  ),
}))


function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}


describe('EditHabitModal', () => {
  const defaultHabit = createMockHabit({ id: 'h-1', title: 'Exercise', frequencyUnit: 'Day' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitDetailResult = { data: null, isPending: false, error: null }
    mockUpdateMutateAsync.mockResolvedValue({})
    mockValidateAll.mockReturnValue(null)
    mockFormGetValues.mockReturnValue({
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
    })
  })

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <EditHabitModal open={false} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the overlay when open with a habit', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByTestId('app-overlay')).toBeDefined()
  })

  it('shows edit habit title', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('habits.editHabit')).toBeDefined()
  })

  it('shows edit description', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('habits.form.editDescription')).toBeDefined()
  })

  it('renders cancel and save buttons', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('common.cancel')).toBeDefined()
    expect(screen.getByText('common.save')).toBeDefined()
  })

  it('renders the form fields component', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByTestId('habit-form-fields')).toBeDefined()
  })

  it('locks General from the caller-supplied prop when the habit has no children', () => {
    mockHabitDetailResult = {
      data: { id: 'h-1', children: [] },
      isPending: false,
      error: null,
    }
    renderWithProviders(
      <EditHabitModal
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
        lockedGeneral={true}
      />,
    )
    expect(screen.getByTestId('habit-form-fields-locked-general')).toHaveTextContent('true')
  })

  it('overrides the caller-supplied lockedGeneral prop with the fetched children, avoiding the filtered-habitsById gap', () => {
    mockHabitDetailResult = {
      data: { id: 'h-1', children: [{ isGeneral: false }] },
      isPending: false,
      error: null,
    }
    renderWithProviders(
      <EditHabitModal
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
        lockedGeneral={null}
      />,
    )
    expect(screen.getByTestId('habit-form-fields-locked-general')).toHaveTextContent('false')
  })

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn()
    renderWithProviders(
      <EditHabitModal
        open={true}
        onOpenChange={onOpenChange}
        habit={defaultHabit}
      />,
    )
    fireEvent.click(screen.getByText('common.cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows validation error when form validation fails', () => {
    mockValidateAll.mockReturnValue('End date must be after start date')
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    const form = screen.getByTestId('app-overlay').querySelector('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('End date must be after start date')
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled()
  })

  it('resets form when modal opens with habit data', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(mockFormReset).toHaveBeenCalled()
    expect(mockResetTags).toHaveBeenCalled()
  })

  it('renders nothing visible when habit is null and open is true', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={null} />,
    )
    expect(screen.getByTestId('app-overlay')).toBeDefined()
  })

  it('disables the fields and the save button while the habit detail is loading', () => {
    mockHabitDetailResult = { data: null, isPending: true, error: null }
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByRole('group')).toBeDisabled()
    const saveButton = screen.getByText('common.save').closest('button')
    expect(saveButton).toBeDisabled()
  })

  it('enables the fields once the habit detail has loaded', () => {
    mockHabitDetailResult = {
      data: { ...defaultHabit, checklistItems: [], children: [] },
      isPending: false,
      error: null,
    }
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByRole('group')).not.toBeDisabled()
  })

  it('calls onSaved after a successful save', async () => {
    const onSaved = vi.fn()
    renderWithProviders(
      <EditHabitModal
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
        onSaved={onSaved}
      />,
    )

    const form = screen.getByTestId('app-overlay').querySelector('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
    })
  })

  it('applies emoji, schedule, and a checklist from an AI suggestion in edit mode', async () => {
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

    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    mockFormSetValue.mockClear()
    mockSetFlexible.mockClear()
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    await waitFor(() => {
      expect(mockSetFlexible).toHaveBeenCalled()
    })
    expect(mockFormSetValue).toHaveBeenCalledWith('emoji', '🏊', {
      shouldDirty: true,
    })
    expect(mockFormSetValue).toHaveBeenCalledWith('dueTime', '07:00', {
      shouldDirty: true,
    })
    expect(mockFormSetValue).toHaveBeenCalledWith(
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
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      return { title: 'Swim', checklistItems: [] }
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

    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    await waitFor(() => {
      expect(mockShowInfo).toHaveBeenCalledWith('habits.form.aiSuggestEmpty')
    })
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('shows the limit-reached toast when the suggestion hits the pay gate', async () => {
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : { title: 'Swim', checklistItems: [] },
    )
    mockSuggestMutateAsync.mockRejectedValue({ data: { errorCode: 'PAY_GATE' } })

    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'habits.form.aiSuggestLimitReached',
      )
    })
  })

  it('applies a recurring cadence with weekdays from an AI suggestion in edit mode', async () => {
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Walk'
      if (field === 'checklistItems') return []
      return { title: 'Walk', checklistItems: [] }
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

    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    await waitFor(() => {
      expect(mockFormSetValue).toHaveBeenCalledWith(
        'days',
        ['Monday', 'Wednesday'],
        { shouldDirty: true },
      )
    })
    expect(mockFormSetValue).toHaveBeenCalledWith('dueTime', '08:00', {
      shouldDirty: true,
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('habits.form.aiSuggestApplied')
  })
})
