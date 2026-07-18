import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { createMockHabit } from '@orbit/shared/__tests__/factories'


const mockUpdateChecklistMutate = vi.fn()
const mockLogHabitMutateAsync = vi.fn()
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

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (time: string) => time,
    currentFormat: '24h' as const,
    toggleFormat: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mockShowError }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabitFullDetail: () => ({
    data: {
      habit: {},
      metrics: {
        currentStreak: 5,
        longestStreak: 14,
        monthlyCompletionRate: 85.5,
      },
      logs: [
        { id: 'log-1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T00:00:00Z' },
        { id: 'log-2', date: '2025-01-14', value: 1, createdAtUtc: '2025-01-14T00:00:00Z' },
      ],
    },
    isLoading: false,
  }),
  useUpdateChecklist: () => ({
    mutate: mockUpdateChecklistMutate,
  }),
  useLogHabit: () => ({
    mutateAsync: mockLogHabitMutateAsync,
  }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    title,
    titleContent,
    footer,
  }: {
    open: boolean
    children: React.ReactNode
    title?: string
    titleContent?: React.ReactNode
    description?: string
    footer?: React.ReactNode
    expandable?: boolean
    onExpandDescription?: () => void
  }) =>
    open ? (
      <div data-testid="app-overlay">
        {(titleContent || title) && <h2>{titleContent || title}</h2>}
        {children}
        {footer}
      </div>
    ) : null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
    onCancel,
    confirmLabel,
    cancelLabel,
  }: {
    open: boolean
    title: string
    description: string
    onConfirm: () => void
    onCancel: () => void
    confirmLabel: string
    cancelLabel: string
    onOpenChange: (open: boolean) => void
    variant?: string
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <p>{description}</p>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>{cancelLabel}</button>
      </div>
    ) : null,
}))

vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({
    items,
    interactive,
    onToggle,
    onReset,
    onClear,
  }: {
    items: Array<{ text: string; isChecked: boolean }>
    interactive?: boolean
    onToggle?: (index: number) => void
    onReset?: () => void
    onClear?: () => void
  }) => (
    <div data-testid="habit-checklist">
      {items.map((item, i) => (
        <div key={item.text}>
          <span>{item.text}</span>
          {interactive && (
            <button onClick={() => onToggle?.(i)}>
              toggle-{i}
            </button>
          )}
        </div>
      ))}
      {interactive && onReset && <button onClick={onReset}>reset</button>}
      {interactive && onClear && <button onClick={onClear}>clear</button>}
    </div>
  ),
}))

vi.mock('@/components/habits/habit-calendar', () => ({
  HabitCalendar: () => <div data-testid="habit-calendar" />,
}))

vi.mock('@/components/habits/description-viewer', () => ({
  DescriptionViewer: () => null,
}))

vi.mock('@/app/(app)/social/_components/new-pair-flow', () => ({
  NewPairFlow: ({
    open,
    initialHabitId,
  }: {
    open: boolean
    initialHabitId?: string | null
  }) =>
    open ? (
      <div
        data-testid="new-pair-flow"
        data-initial-habit-id={initialHabitId ?? ''}
      />
    ) : null,
}))


describe('HabitDetailDrawer', () => {
  const defaultHabit = createMockHabit({
    id: 'h-1',
    title: 'Exercise',
    dueTime: '09:00',
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogHabitMutateAsync.mockResolvedValue({})
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <HabitDetailDrawer
        open={false}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.queryByTestId('app-overlay')).toBeNull()
  })

  it('renders the overlay when open', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.getByTestId('app-overlay')).toBeDefined()
  })

  it('displays the habit title', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.getByText('Exercise')).toBeDefined()
  })

  it('renders the habit tags in the detail header', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={createMockHabit({
          title: 'Read',
          tags: [
            { id: '1', name: 'Learning', color: '#7c3aed' },
            { id: '2', name: 'Evening', color: '#10b981' },
          ],
        })}
      />,
    )
    expect(screen.getByText('Learning')).toBeDefined()
    expect(screen.getByText('Evening')).toBeDefined()
  })

  it('shows due time when habit has dueTime', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.getByText('09:00')).toBeDefined()
  })

  it('does not show due time when habit has no dueTime', () => {
    const habit = createMockHabit({ dueTime: null })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    expect(screen.queryByText('09:00')).toBeNull()
  })

  it('does not render edit and delete footer actions', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.queryByText('common.edit')).toBeNull()
    expect(screen.queryByText('common.delete')).toBeNull()
  })

  it('displays streak metrics', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.getByText('habits.detail.currentStreak')).toBeDefined()
    expect(screen.getByText('habits.detail.longestStreak')).toBeDefined()
    expect(screen.getByText('habits.detail.monthlyRate')).toBeDefined()
    expect(screen.getByText('86%')).toBeDefined()
  })

  it('renders the calendar component', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.getByTestId('habit-calendar')).toBeDefined()
  })

  it('renders checklist when habit has checklist items', () => {
    const habit = createMockHabit({
      checklistItems: [
        { text: 'Warm up', isChecked: false },
        { text: 'Main set', isChecked: true },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    expect(screen.getByTestId('habit-checklist')).toBeDefined()
    expect(screen.getByText('Warm up')).toBeDefined()
    expect(screen.getByText('Main set')).toBeDefined()
  })

  it('calls updateChecklist when a checklist item is toggled', () => {
    const habit = createMockHabit({
      id: 'h-1',
      checklistItems: [
        { text: 'Warm up', isChecked: false },
        { text: 'Main set', isChecked: false },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    fireEvent.click(screen.getByText('toggle-0'))
    expect(mockUpdateChecklistMutate).toHaveBeenCalledWith({
      habitId: 'h-1',
      items: [
        { text: 'Warm up', isChecked: true },
        { text: 'Main set', isChecked: false },
      ],
    })
  })

  it('shows checklist log prompt when all items checked and habit incomplete', () => {
    const habit = createMockHabit({
      id: 'h-1',
      isCompleted: false,
      checklistItems: [
        { text: 'Only item', isChecked: false },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    fireEvent.click(screen.getByText('toggle-0'))
    expect(screen.getByTestId('confirm-dialog')).toBeDefined()
    expect(screen.getByText('habits.checklistCompleteTitle')).toBeDefined()
  })

  it('gates checklist clear behind a confirmation and only clears on confirm', () => {
    const habit = createMockHabit({
      id: 'h-1',
      checklistItems: [
        { text: 'Warm up', isChecked: false },
        { text: 'Main set', isChecked: true },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    fireEvent.click(screen.getByText('clear'))
    expect(mockUpdateChecklistMutate).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-dialog')).toBeDefined()
    expect(screen.getByText('habits.checklistClearTitle')).toBeDefined()
    fireEvent.click(screen.getByText('habits.form.clearChecklist'))
    expect(mockUpdateChecklistMutate).toHaveBeenCalledWith({
      habitId: 'h-1',
      items: [],
    })
  })

  it('surfaces an error toast when logging from the checklist-complete confirm fails', async () => {
    mockLogHabitMutateAsync.mockRejectedValue(new Error('offline'))
    const habit = createMockHabit({
      id: 'h-1',
      isCompleted: false,
      checklistItems: [{ text: 'Only item', isChecked: false }],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    fireEvent.click(screen.getByText('toggle-0'))
    fireEvent.click(screen.getByText('habits.checklistCompleteConfirm'))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1))
  })

  it('lists linked goals with a section label', () => {
    const habit = createMockHabit({
      currentStreak: 3,
      linkedGoals: [
        { id: 'g-1', title: 'Run a marathon' },
        { id: 'g-2', title: 'Sleep better' },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    expect(screen.getByText('habits.detail.linkedGoal')).toBeDefined()
    expect(screen.getByText('Run a marathon')).toBeDefined()
    expect(screen.getByText('Sleep better')).toBeDefined()
  })

  it('shows scheduled reminders when habit has them', () => {
    const habit = createMockHabit({
      scheduledReminders: [
        { when: 'same_day' as const, time: '08:00:00' },
        { when: 'day_before' as const, time: '20:00:00' },
      ],
    })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    expect(screen.getByText('habits.form.scheduledReminderSameDay')).toBeDefined()
    expect(screen.getByText('habits.form.scheduledReminderDayBefore')).toBeDefined()
  })

  it('shows end date when habit has one', () => {
    const habit = createMockHabit({ endDate: '2025-06-30' })
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={habit}
      />,
    )
    expect(screen.getByText(/habits\.detail\.endsOn/)).toBeDefined()
  })

  it('opens the pair-a-buddy flow prefilled with the habit when the buddy row is clicked', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    expect(screen.queryByTestId('new-pair-flow')).toBeNull()
    fireEvent.click(screen.getByText('social.buddies.pairThisHabit'))
    const flow = screen.getByTestId('new-pair-flow')
    expect(flow).toBeDefined()
    expect(flow.getAttribute('data-initial-habit-id')).toBe('h-1')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('draws exactly one rule between the pair row and the Ask-Astra CTA, never two (#447 Bug 4)', () => {
    const { container } = render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={defaultHabit}
      />,
    )
    const askAstra = screen.getByRole('button', {
      name: /habits\.detail\.askAstraEyebrow/,
    })
    expect(askAstra.style.borderTop).toBe('')

    const pairRow = screen.getByText('social.buddies.pairThisHabit').closest('button')
    expect(pairRow?.style.borderBottomWidth).toBe('0px')
    expect(container.querySelectorAll('[data-separator]')).toHaveLength(1)
  })

  it('renders nothing visible when habit is null', () => {
    render(
      <HabitDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        habit={null}
      />,
    )
    expect(screen.getByTestId('app-overlay')).toBeDefined()
  })
})
