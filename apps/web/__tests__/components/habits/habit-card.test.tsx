import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { HabitCard } from '@/components/habits/habit-card'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (time: string) => time,
    currentFormat: '24h' as const,
    toggleFormat: vi.fn(),
  }),
}))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

// ---------------------------------------------------------------------------
// Tests — focused on the rewritten card's observable behavior
// ---------------------------------------------------------------------------

describe('HabitCard (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the habit title', () => {
    const habit = createMockHabit({ title: 'Morning Run' })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('Morning Run')).toBeDefined()
  })

  it('calls onLog when the log button is clicked on a pending habit', () => {
    const onLog = vi.fn()
    const habit = createMockHabit({ isCompleted: false, isLoggedInRange: false })
    render(<HabitCard habit={habit} actions={{ onLog }} />)

    const logButton = screen.getByLabelText('habits.card.logAction')
    fireEvent.click(logButton)
    expect(onLog).toHaveBeenCalledTimes(1)
  })

  it('calls onUnlog when the log button is clicked on a completed habit', () => {
    const onUnlog = vi.fn()
    const habit = createMockHabit({ isCompleted: true })
    render(<HabitCard habit={habit} actions={{ onUnlog }} />)

    const logButton = screen.getByLabelText('habits.card.logAction')
    fireEvent.click(logButton)
    expect(onUnlog).toHaveBeenCalledTimes(1)
  })

  it('shows the streak flame only when currentStreak >= 2', () => {
    const habitNoStreak = createMockHabit({ currentStreak: 1 })
    const { rerender } = render(<HabitCard habit={habitNoStreak} />)
    expect(screen.queryByLabelText(/day streak/i)).toBeNull()

    const habitWithStreak = createMockHabit({ currentStreak: 5 })
    rerender(<HabitCard habit={habitWithStreak} />)
    expect(screen.getByLabelText('5 day streak')).toBeDefined()
  })

  it('calls onToggleExpand when a parent with children is clicked', () => {
    const onToggleExpand = vi.fn()
    const habit = createMockHabit()
    render(
      <HabitCard
        habit={habit}
        hasChildren
        childrenDone={1}
        childrenTotal={3}
        actions={{ onToggleExpand }}
      />,
    )

    fireEvent.click(screen.getByLabelText(habit.title))
    expect(onToggleExpand).toHaveBeenCalledTimes(1)
  })

  it('reveals the inline preview with a "See more" button when the card is tapped (leaf habit)', () => {
    const onDetail = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onDetail }} />)

    fireEvent.click(screen.getByLabelText(habit.title))

    const seeMore = screen.getByText('habits.card.seeMore')
    fireEvent.click(seeMore)
    expect(onDetail).toHaveBeenCalledTimes(1)
  })

  it('toggles selection when the card is tapped in select mode', () => {
    const onToggleSelection = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode actions={{ onToggleSelection }} />)

    fireEvent.click(screen.getByLabelText(habit.title))
    expect(onToggleSelection).toHaveBeenCalledTimes(1)
  })

  it('renders menu options when the menu button is clicked', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onEdit, onDelete }} />)

    fireEvent.click(screen.getByLabelText('habits.card.menuAction'))
    fireEvent.click(screen.getByText('common.edit'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})
