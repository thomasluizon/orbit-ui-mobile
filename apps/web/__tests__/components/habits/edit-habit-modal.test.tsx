import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateMutateAsync = vi.fn()
const mockFormReset = vi.fn()
const mockFormSetValue = vi.fn()
const mockFormGetValues = vi.fn()
const mockFormWatch = vi.fn()
const mockFormRegister = vi.fn(() => ({ name: 'test', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() }))
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

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    error: null,
  }),
  useHabitDetail: () => ({
    data: null,
    error: null,
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
    setFlexible: vi.fn(),
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
    newTagColor: '#7c3aed',
    setNewTagColor: vi.fn(),
    tagColors: ['#7c3aed'],
  }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
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
  }: {
    open: boolean
    children: React.ReactNode
    title?: string
    description?: string
  }) =>
    open ? (
      <div data-testid="app-overlay">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
        {children}
      </div>
    ) : null,
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="habit-form-fields">{children}</div>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditHabitModal', () => {
  const defaultHabit = createMockHabit({ id: 'h-1', title: 'Exercise', frequencyUnit: 'Day' })

  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(screen.getByText('habits.saveChanges')).toBeDefined()
  })

  it('renders the form fields component', () => {
    renderWithProviders(
      <EditHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByTestId('habit-form-fields')).toBeDefined()
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
    // The overlay still renders but form reset won't fire with data
    expect(screen.getByTestId('app-overlay')).toBeDefined()
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
})
