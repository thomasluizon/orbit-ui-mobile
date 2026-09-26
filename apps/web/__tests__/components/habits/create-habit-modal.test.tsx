import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { ApiClientError } from '@orbit/shared/utils'


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
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
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
    onSuggestEmoji,
  }: {
    children?: React.ReactNode
    onSuggestSetup?: () => void
    onSuggestEmoji?: () => void
  }) => (
    <div data-testid="habit-form-fields">
      {onSuggestSetup && (
        <button type="button" data-testid="suggest-trigger" onClick={() => onSuggestSetup()}>
          suggest
        </button>
      )}
      {onSuggestEmoji && (
        <button type="button" data-testid="emoji-suggest-trigger" onClick={() => onSuggestEmoji()}>
          suggest emoji
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
    onSuggestEmoji,
  }: {
    children?: React.ReactNode
    onSuggestSetup?: () => void
    onSuggestEmoji?: () => void
  }) => (
    <div data-testid="habit-form-fields">
      {onSuggestSetup && (
        <button type="button" data-testid="suggest-trigger" onClick={() => onSuggestSetup()}>
          suggest
        </button>
      )}
      {onSuggestEmoji && (
        <button type="button" data-testid="emoji-suggest-trigger" onClick={() => onSuggestEmoji()}>
          suggest emoji
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
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
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

  it.each([
    [403, undefined, 'Blocked by the edge', 'errors.api.edgeBlocked'],
    [400, 'VALIDATION_ERROR', 'Title must be 200 characters or fewer', 'habits.form.titleTooLong'],
    [429, 'RATE_LIMITED', 'Rate limited', 'toast.errors.tooManyRequests'],
    [500, 'INTERNAL_SERVER_ERROR', 'Server failed', 'toast.errors.server'],
    [403, 'PAY_GATE', 'Calendar integration is a Pro feature. Upgrade to unlock!', 'errors.api.calendarPro'],
    [400, 'HABIT_LIMIT_REACHED', "You've reached the 1000 habit limit.", 'errors.api.habitLimit'],
  ])('shows the classified create error for %i %s', async (status, code, message, expected) => {
    mockCreateMutateAsync.mockRejectedValue(new ApiClientError(status, message, { code }))
    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    fireEvent.submit(screen.getByTestId('app-overlay').querySelector('form')!)
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expected))
    expect(mockShowError).not.toHaveBeenCalledWith('errors.createHabit')
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

  it('changes only the emoji when the person already set a schedule by hand', async () => {
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return 'Swim'
      return {
        title: 'Swim',
        frequencyUnit: 'Day',
        frequencyQuantity: 2,
        days: ['Tuesday'],
        dueTime: '18:00',
        checklistItems: [{ text: 'Pack towel', isChecked: false }],
      }
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🏊',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: ['Monday'],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '07:00',
      subHabits: ['Warm up'],
      checklistItems: ['Goggles'],
    })

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    mockFormSetValue.mockClear()
    mockSetFlexible.mockClear()
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))

    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())
    expect(mockFormSetValue.mock.calls).toEqual([
      ['emoji', '🏊', { shouldDirty: true }],
    ])
    expect(mockSetFlexible).not.toHaveBeenCalled()
  })

  it('uses the existing pay-gate message for an emoji suggestion refusal', async () => {
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockRejectedValue({ data: { errorCode: 'PAY_GATE' } })

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('habits.form.aiSuggestLimitReached')
    })
    expect(mockFormSetValue).not.toHaveBeenCalledWith(
      'emoji',
      expect.anything(),
      expect.anything(),
    )
  })

  it('leaves the form untouched and offers retry when emoji suggestion fails', async () => {
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockRejectedValue(new Error('offline'))

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('habits.form.aiSuggestError')
    })
    expect(mockFormSetValue).not.toHaveBeenCalled()
  })

  it('ignores an emoji suggestion after the title changes away and back', async () => {
    let title = 'Swim'
    let resolveSuggestion!: (value: Record<string, unknown>) => void
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? title : {},
    )
    mockSuggestMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSuggestion = resolve
      }),
    )

    mockFormWatch.mockImplementation((field?: string) =>
      field === 'title' ? title : undefined,
    )
    const { rerender } = renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())

    title = 'Run'
    rerender(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    title = 'Swim'
    rerender(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    await act(async () => {
      resolveSuggestion({
        emoji: '🏊',
        frequencyUnit: null,
        frequencyQuantity: null,
        days: [],
        isFlexible: false,
        flexibleTarget: null,
        dueTime: null,
        subHabits: [],
        checklistItems: [],
      })
      await Promise.resolve()
    })

    expect(mockFormSetValue).not.toHaveBeenCalled()
  })

  it('ignores a pending emoji suggestion after the create modal unmounts', async () => {
    let resolveSuggestion!: (value: Record<string, unknown>) => void
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSuggestion = resolve
      }),
    )

    const { unmount } = renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())

    unmount()
    await act(async () => {
      resolveSuggestion({
        emoji: '🏊',
        frequencyUnit: null,
        frequencyQuantity: null,
        days: [],
        isFlexible: false,
        flexibleTarget: null,
        dueTime: null,
        subHabits: [],
        checklistItems: [],
      })
      await Promise.resolve()
    })

    expect(mockFormSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowInfo).not.toHaveBeenCalled()
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('starts only one request when both suggestion actions are pressed', async () => {
    let resolveSuggestion!: (value: Record<string, unknown>) => void
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSuggestion = resolve
      }),
    )

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))
    fireEvent.click(screen.getByTestId('suggest-trigger'))

    expect(mockSuggestMutateAsync).toHaveBeenCalledOnce()
    resolveSuggestion({
      emoji: '🏊',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })
    await waitFor(() => expect(mockFormSetValue).toHaveBeenCalled())
  })

  it('reports an empty emoji suggestion without changing the form', async () => {
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
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

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))

    await waitFor(() => {
      expect(mockShowInfo).toHaveBeenCalledWith('habits.form.aiSuggestEmpty')
    })
    expect(mockFormSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('ignores a successful full suggestion after the title changes', async () => {
    let title = 'Swim'
    let resolveSuggestion!: (value: Record<string, unknown>) => void
    mockFormGetValues.mockImplementation((field?: string) => {
      if (field === 'title') return title
      if (field === 'checklistItems') return []
      return {}
    })
    mockFormWatch.mockImplementation((field?: string) =>
      field === 'title' ? title : undefined,
    )
    mockSuggestMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSuggestion = resolve
      }),
    )

    const { rerender } = renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    mockFormSetValue.mockClear()
    fireEvent.click(screen.getByTestId('suggest-trigger'))
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())

    title = 'Run'
    rerender(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    await act(async () => {
      resolveSuggestion({
        emoji: '🏊',
        frequencyUnit: 'Week',
        frequencyQuantity: 1,
        days: ['Monday'],
        isFlexible: false,
        flexibleTarget: null,
        dueTime: '07:00',
        subHabits: [],
        checklistItems: ['Goggles'],
      })
      await Promise.resolve()
    })

    expect(mockFormSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowInfo).not.toHaveBeenCalled()
  })

  it('ignores a failed full suggestion after the modal unmounts', async () => {
    let rejectSuggestion!: (error: Error) => void
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSuggestion = reject
      }),
    )

    const { unmount } = renderWithProviders(
      <CreateHabitModal open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('suggest-trigger'))
    await waitFor(() => expect(mockSuggestMutateAsync).toHaveBeenCalledOnce())

    unmount()
    await act(async () => {
      rejectSuggestion(new Error('offline'))
      await Promise.resolve()
    })

    expect(mockFormSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowInfo).not.toHaveBeenCalled()
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('skips both suggestion actions when the title is empty', async () => {
    mockFormGetValues.mockImplementation((field?: string) =>
      field === 'title' ? '   ' : {},
    )

    renderWithProviders(<CreateHabitModal open={true} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('suggest-trigger'))
    fireEvent.click(screen.getByTestId('emoji-suggest-trigger'))
    await act(async () => Promise.resolve())

    expect(mockSuggestMutateAsync).not.toHaveBeenCalled()
  })
})
