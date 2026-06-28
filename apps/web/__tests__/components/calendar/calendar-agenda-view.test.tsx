import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enUS } from 'date-fns/locale'
import type { DragEndEvent } from '@dnd-kit/core'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import type { AgendaEntry } from '@/components/calendar/use-agenda-day'

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined
const updateMutate = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()

const agendaData = {
  entries: [] as AgendaEntry[],
  habitsById: new Map<string, HabitScheduleItem>(),
  isLoading: false,
  isFetching: false,
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/calendar/use-agenda-day', () => ({
  useAgendaDay: () => agendaData,
}))

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutate: updateMutate, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess,
    showError,
    showToast: vi.fn(),
    showInfo: vi.fn(),
    showQueued: vi.fn(),
    dismissToast: vi.fn(),
  }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: (event: DragEndEvent) => void
  }) => {
    capturedOnDragEnd = onDragEnd
    return <>{children}</>
  },
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}))

import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'h1',
    title: 'Workout',
    description: null,
    emoji: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: '07:00',
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    children: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    instances: [],
    ...overrides,
  }
}

function makeEntry(overrides: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    habitId: 'h1',
    title: 'Workout',
    status: 'upcoming',
    isBadHabit: false,
    dueTime: '07:00',
    isOneTime: false,
    dueEndTime: null,
    ...overrides,
  }
}

function dragEvent(habitId: string, minutes: number, deltaY: number): DragEndEvent {
  return {
    active: { id: habitId, data: { current: { minutes } } },
    delta: { x: 0, y: deltaY },
  } as unknown as DragEndEvent
}

function renderAgenda() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarAgendaView
        displayTime={(time) => time}
        dateFnsLocale={enUS}
        showRecurring
        onShowRecurringChange={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('CalendarAgendaView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnDragEnd = undefined
    agendaData.entries = []
    agendaData.habitsById = new Map()
    updateMutate.mockImplementation(
      (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    )
  })

  it('places a timed habit as a draggable block on the planner', () => {
    agendaData.entries = [makeEntry({ habitId: 'h1', title: 'Workout', dueTime: '07:00' })]
    agendaData.habitsById = new Map([['h1', makeHabit()]])

    renderAgenda()

    const block = screen.getByTestId('agenda-event')
    expect(block).toHaveAttribute('data-habit-id', 'h1')
    expect(block).toHaveTextContent('Workout')
  })

  it('keeps an untimed habit in the all-day band, not the timeline', () => {
    agendaData.entries = [makeEntry({ habitId: 'h2', title: 'Read', dueTime: null })]
    agendaData.habitsById = new Map([['h2', makeHabit({ id: 'h2', title: 'Read', dueTime: null })]])

    renderAgenda()

    expect(screen.queryByTestId('agenda-event')).toBeNull()
    expect(screen.getByTestId('agenda-all-day-event')).toHaveTextContent('Read')
  })

  it('persists the new dueTime through updateHabit when a block is dropped lower', () => {
    agendaData.entries = [makeEntry({ habitId: 'h1', title: 'Workout', dueTime: '07:00' })]
    agendaData.habitsById = new Map([['h1', makeHabit({ dueTime: '07:00' })]])

    renderAgenda()

    expect(capturedOnDragEnd).toBeDefined()
    act(() => {
      capturedOnDragEnd?.(dragEvent('h1', 420, 56 * 2))
    })

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const [vars] = updateMutate.mock.calls[0] as [
      { habitId: string; data: { dueTime?: string; title: string; isBadHabit: boolean } },
    ]
    expect(vars.habitId).toBe('h1')
    expect(vars.data.dueTime).toBe('09:00')
    expect(vars.data.title).toBe('Workout')
    expect(vars.data.isBadHabit).toBe(false)
    expect(showSuccess).toHaveBeenCalledWith('calendar.rescheduled')
  })

  it('shifts the end time to preserve duration when a ranged block moves', () => {
    agendaData.entries = [makeEntry({ habitId: 'h1', dueTime: '09:00', dueEndTime: '10:00' })]
    agendaData.habitsById = new Map([['h1', makeHabit({ dueTime: '09:00', dueEndTime: '10:00' })]])

    renderAgenda()

    act(() => {
      capturedOnDragEnd?.(dragEvent('h1', 540, 56 * 5))
    })

    const [vars] = updateMutate.mock.calls[0] as [{ data: { dueTime?: string; dueEndTime?: string } }]
    expect(vars.data.dueTime).toBe('14:00')
    expect(vars.data.dueEndTime).toBe('15:00')
  })

  it('rolls back with an error toast when the reschedule mutation fails', () => {
    agendaData.entries = [makeEntry({ habitId: 'h1', dueTime: '07:00' })]
    agendaData.habitsById = new Map([['h1', makeHabit({ dueTime: '07:00' })]])
    updateMutate.mockImplementation(
      (_vars: unknown, opts?: { onError?: () => void }) => opts?.onError?.(),
    )

    renderAgenda()

    act(() => {
      capturedOnDragEnd?.(dragEvent('h1', 420, 56))
    })

    expect(showError).toHaveBeenCalledWith('errors.updateHabit')
  })

  it('ignores a drop that resolves to the same time', () => {
    agendaData.entries = [makeEntry({ habitId: 'h1', dueTime: '07:00' })]
    agendaData.habitsById = new Map([['h1', makeHabit({ dueTime: '07:00' })]])

    renderAgenda()

    act(() => {
      capturedOnDragEnd?.(dragEvent('h1', 420, 0))
    })

    expect(updateMutate).not.toHaveBeenCalled()
  })
})
