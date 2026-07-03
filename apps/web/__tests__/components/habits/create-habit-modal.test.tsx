import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'


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
  useProfile: () => ({
    profile: { hasProAccess: true },
  }),
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
    newTagColor: '#7f46f7',
    setNewTagColor: vi.fn(),
    tagColors: ['#7f46f7'],
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
  buildCreateHabitRequest: vi.fn(() => ({})),
  buildSubHabitRequest: vi.fn(() => ({})),
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

vi.mock('./habit-form-fields', () => ({
  HabitFormFields: ({
    children,
    onSuggestSetup,
  }: {
    children?: React.ReactNode
    onSuggestSetup?: () => void
  }) => (
    <div data-testid="habit-form-fields">
      {onSuggestSetup && (
        <button type="button" data-testid="suggest-trigger" onClick={() => onSuggestSetup()}>
          suggest
        </button>
      )}
      {children}
    </div>
  ),
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: ({
    children,
    onSuggestSetup,
  }: {
    children?: React.ReactNode
    onSuggestSetup?: () => void
  }) => (
    <div data-testid="habit-form-fields">
      {onSuggestSetup && (
        <button type="button" data-testid="suggest-trigger" onClick={() => onSuggestSetup()}>
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


describe('CreateHabitModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMutateAsync.mockResolvedValue({})
    mockCreateSubMutateAsync.mockResolvedValue({})
    mockValidateAll.mockReturnValue(null)
    mockFormWatch.mockImplementation((field?: string) => {
      switch (field) {
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
    expect(screen.getByTestId('app-overlay')).toBeDefined()
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

  it('renders cancel and a tight create button', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('common.cancel')).toBeDefined()
    const submit = screen.getByTestId('habit-create-submit')
    expect(submit.textContent).toContain('common.create')
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
    const form = screen.getByTestId('app-overlay').querySelector('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('Validation failed!')
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
    expect(mockCreateSubMutateAsync).not.toHaveBeenCalled()
  })

  it('resets form when modal opens', () => {
    renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    expect(mockFormReset).toHaveBeenCalled()
    expect(mockResetTags).toHaveBeenCalled()
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
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    await waitFor(() => {
      expect(mockSetFlexible).toHaveBeenCalled()
    })
    expect(mockFormSetValue).toHaveBeenCalledWith('dueTime', '07:00', { shouldDirty: true })
    expect(mockFormSetValue).toHaveBeenCalledWith(
      'checklistItems',
      [
        { text: 'Towel', isChecked: false },
        { text: 'Goggles', isChecked: false },
      ],
      { shouldDirty: true },
    )
  })
})
