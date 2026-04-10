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

vi.mock('@/components/ui/highlight-text', () => ({
  HighlightText: ({ text }: { text: string; query: string }) => <span>{text}</span>,
}))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HabitCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('Exercise')).toBeDefined()
  })

  it('displays the habit title', () => {
    const habit = createMockHabit({ title: 'Morning Run' })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('Morning Run')).toBeDefined()
  })

  it('displays the habit description when provided', () => {
    const habit = createMockHabit({ description: 'Run for 30 minutes' })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('Run for 30 minutes')).toBeDefined()
  })

  it('does not render description when null', () => {
    const habit = createMockHabit({ description: null })
    render(<HabitCard habit={habit} />)
    expect(screen.queryByText('Run for 30 minutes')).toBeNull()
  })

  it('renders the clickable card with aria-label', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    const article = screen.getByLabelText('Exercise')
    expect(article.tagName).toBe('DIV')
    expect(article.getAttribute('role')).toBe('button')
    expect(article.getAttribute('tabindex')).toBe('0')
  })

  it('calls onDetail when card is clicked', () => {
    const onDetail = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onDetail }} />)
    fireEvent.click(screen.getByLabelText('Exercise'))
    expect(onDetail).toHaveBeenCalledOnce()
  })

  it('calls onToggleSelection instead of onDetail in select mode', () => {
    const onDetail = vi.fn()
    const onToggleSelection = vi.fn()
    const habit = createMockHabit()
    render(
      <HabitCard
        habit={habit}
        isSelectMode={true}
        actions={{ onDetail, onToggleSelection }}
      />,
    )
    fireEvent.click(screen.getByLabelText('Exercise'))
    expect(onToggleSelection).toHaveBeenCalledOnce()
    expect(onDetail).not.toHaveBeenCalled()
  })

  it('calls onLog when log button is clicked on incomplete habit', () => {
    const onLog = vi.fn()
    const habit = createMockHabit({ isCompleted: false })
    render(<HabitCard habit={habit} actions={{ onLog }} />)
    const logBtn = screen.getByLabelText('habits.logHabit')
    fireEvent.click(logBtn)
    expect(onLog).toHaveBeenCalledOnce()
  })

  it('calls onUnlog when log button is clicked on completed habit', () => {
    const onUnlog = vi.fn()
    const habit = createMockHabit({ isCompleted: true })
    render(<HabitCard habit={habit} actions={{ onUnlog }} />)
    const unlogBtn = screen.getByLabelText(
      /habits\.actions\.unlog/,
    )
    fireEvent.click(unlogBtn)
    expect(onUnlog).toHaveBeenCalledOnce()
  })

  it('applies opacity-40 when habit is completed', () => {
    const habit = createMockHabit({ isCompleted: true })
    render(<HabitCard habit={habit} />)
    expect(screen.getByLabelText('Exercise').className).toContain('opacity-40')
  })

  it('applies line-through to title when completed', () => {
    const habit = createMockHabit({ isCompleted: true })
    render(<HabitCard habit={habit} />)
    const title = screen.getByText('Exercise').closest('h3')
    expect(title?.className).toContain('line-through')
  })

  it('shows the bad habit badge for bad habits', () => {
    const habit = createMockHabit({ isBadHabit: true })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('habits.badHabit')).toBeDefined()
  })

  it('shows overdue badge when habit is overdue', () => {
    const habit = createMockHabit({
      isOverdue: true,
      isCompleted: false,
      isGeneral: false,
      frequencyUnit: null,
    })
    render(<HabitCard habit={habit} selectedDate={new Date('2025-01-02')} />)
    expect(screen.getByText('habits.overdue')).toBeDefined()
  })

  it('shows general habit frequency label', () => {
    const habit = createMockHabit({ isGeneral: true })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('habits.generalHabit')).toBeDefined()
  })

  it('shows one-time task label when no frequency unit', () => {
    const habit = createMockHabit({ frequencyUnit: null })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('habits.oneTimeTask')).toBeDefined()
  })

  it('renders tag badges', () => {
    const habit = createMockHabit({
      tags: [
        { id: 'tag-1', name: 'Health', color: '#ff0000' },
        { id: 'tag-2', name: 'Fitness', color: '#00ff00' },
      ],
    })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('Health')).toBeDefined()
    expect(screen.getByText('Fitness')).toBeDefined()
  })

  it('shows due time when provided', () => {
    const habit = createMockHabit({ dueTime: '09:00' })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('09:00')).toBeDefined()
  })

  it('shows time range when both dueTime and dueEndTime are set', () => {
    const habit = createMockHabit({ dueTime: '09:00', dueEndTime: '10:00' })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('09:00 - 10:00')).toBeDefined()
  })

  it('renders select checkbox in select mode', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode={true} isSelected={false} />)
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox).toBeDefined()
    expect(checkbox.checked).toBe(false)
  })

  it('renders selected checkbox in select mode when selected', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode={true} isSelected={true} />)
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('does not show the actions menu trigger in select mode', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode={true} />)
    expect(screen.queryByLabelText('habits.actions.more')).toBeNull()
  })

  it('shows actions menu trigger when not in select mode', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode={false} />)
    expect(screen.getByLabelText('habits.actions.more')).toBeDefined()
  })

  it('opens actions menu on trigger click', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('shows delete action in the menu', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('common.delete')).toBeDefined()
  })

  it('calls onDelete when delete menu item is clicked', () => {
    const onDelete = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onDelete }} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    fireEvent.click(screen.getByText('common.delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('shows duplicate action in the menu', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('habits.actions.duplicate')).toBeDefined()
  })

  it('calls onDuplicate when duplicate menu item is clicked', () => {
    const onDuplicate = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onDuplicate }} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    fireEvent.click(screen.getByText('habits.actions.duplicate'))
    expect(onDuplicate).toHaveBeenCalledOnce()
  })

  it('shows select action in the menu', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('common.select')).toBeDefined()
  })

  it('shows move parent action in the menu', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('habits.moveParent.button')).toBeDefined()
  })

  it('shows expand/collapse button when hasChildren is true', () => {
    const habit = createMockHabit()
    render(
      <HabitCard
        habit={habit}
        hasChildren={true}
        childrenDone={1}
        childrenTotal={3}
      />,
    )
    expect(screen.getByLabelText('habits.collapseAll')).toBeDefined()
  })

  it('calls onToggleExpand when expand button is clicked', () => {
    const onToggleExpand = vi.fn()
    const habit = createMockHabit()
    render(
      <HabitCard
        habit={habit}
        hasChildren={true}
        childrenDone={1}
        childrenTotal={3}
        actions={{ onToggleExpand }}
      />,
    )
    fireEvent.click(screen.getByLabelText('habits.collapseAll'))
    expect(onToggleExpand).toHaveBeenCalledOnce()
  })

  it('renders progress ring for parent with children', () => {
    const habit = createMockHabit({ isCompleted: false })
    const { container } = render(
      <HabitCard
        habit={habit}
        hasChildren={true}
        childrenDone={2}
        childrenTotal={3}
      />,
    )
    expect(container.querySelector('svg')).toBeDefined()
    expect(screen.getByText('2/3')).toBeDefined()
  })

  it('shows checklist badge when habit has checklist items', () => {
    const habit = createMockHabit({
      checklistItems: [
        { text: 'Step 1', isChecked: true },
        { text: 'Step 2', isChecked: false },
      ],
    })
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('1/2')).toBeDefined()
  })

  it('shows add sub-habit menu item when allowed', () => {
    const habit = createMockHabit()
    render(
      <HabitCard habit={habit} showAddSubHabit={true} depth={0} maxHabitDepth={5} />,
    )
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('habits.form.addSubHabit')).toBeDefined()
  })

  it('does not show add sub-habit when at max depth', () => {
    const habit = createMockHabit()
    render(
      <HabitCard habit={habit} showAddSubHabit={true} depth={4} maxHabitDepth={5} />,
    )
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.queryByText('habits.form.addSubHabit')).toBeNull()
  })

  it('shows drill into action when hasSubHabits is true', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} hasSubHabits={true} />)
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(screen.getByText('habits.actions.openSubHabits')).toBeDefined()
  })

  it('card div is focusable and clickable (Enter/Space handled via onKeyDown)', () => {
    const onDetail = vi.fn()
    const habit = createMockHabit()
    render(<HabitCard habit={habit} actions={{ onDetail }} />)
    const card = screen.getByLabelText('Exercise')
    expect(card.tagName).toBe('DIV')
    expect(card.getAttribute('role')).toBe('button')
    expect(card.getAttribute('tabindex')).toBe('0')
    fireEvent.click(card)
    expect(onDetail).toHaveBeenCalledOnce()
  })

  it('applies indent style for child habits', () => {
    const habit = createMockHabit()
    const { container } = render(<HabitCard habit={habit} depth={2} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper?.style.marginLeft).toBe('3rem')
  })

  it('uses child CSS classes at depth > 0', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} depth={1} />)
    expect(screen.getByLabelText('Exercise').className).toContain('habit-card-child')
  })

  it('uses parent CSS classes at depth 0', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} depth={0} />)
    expect(screen.getByLabelText('Exercise').className).toContain('habit-card-parent')
  })

  it('renders ring highlight when isSelected is true', () => {
    const habit = createMockHabit()
    render(<HabitCard habit={habit} isSelectMode={true} isSelected={true} />)
    expect(screen.getByLabelText('Exercise').className).toContain('ring-2')
  })

  it('shows streak badge when currentStreak >= 2', () => {
    const habit = createMockHabit({ currentStreak: 5 } as Record<string, unknown>)
    render(<HabitCard habit={habit} />)
    expect(screen.getByText('5')).toBeDefined()
  })
})
