import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TodayFilters, type TodayFiltersProps } from '@/components/habits/today-filters'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Search: (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', { ...props, 'data-testid': 'search-icon' }),
  X: (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', { ...props, 'data-testid': 'x-icon' }),
  MoreVertical: (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', { ...props, 'data-testid': 'more-icon' }),
}))

function renderTodayFilters(overrides: Partial<TodayFiltersProps> = {}) {
  const defaultProps: TodayFiltersProps = {
    activeView: 'today',
    localSearchQuery: '',
    selectedFrequency: null,
    selectedTagIds: [],
    tags: [],
    frequencyOptions: [
      { key: 'Day' as const, label: 'Daily' },
      { key: 'Week' as const, label: 'Weekly' },
    ],
    controlsMenuRef: { current: null },
    onSearchChange: vi.fn(),
    onSearchClear: vi.fn(),
    onFrequencyChange: vi.fn(),
    onTagToggle: vi.fn(),
    onOpenControlsMenu: vi.fn(),
    ...overrides,
  }
  return { ...render(<TodayFilters {...defaultProps} />), props: defaultProps }
}

describe('TodayFilters', () => {
  it('renders search input', () => {
    renderTodayFilters()
    expect(screen.getByPlaceholderText('habits.searchPlaceholder')).toBeInTheDocument()
  })

  it('calls onSearchChange when typing', () => {
    const onSearchChange = vi.fn()
    renderTodayFilters({ onSearchChange })
    const input = screen.getByPlaceholderText('habits.searchPlaceholder')
    fireEvent.change(input, { target: { value: 'exercise' } })
    expect(onSearchChange).toHaveBeenCalledWith('exercise')
  })

  it('shows clear button when search query is non-empty', () => {
    renderTodayFilters({ localSearchQuery: 'test' })
    expect(screen.getByLabelText('common.clear')).toBeInTheDocument()
  })

  it('does not show clear button when search query is empty', () => {
    renderTodayFilters({ localSearchQuery: '' })
    expect(screen.queryByLabelText('common.clear')).not.toBeInTheDocument()
  })

  it('calls onSearchClear when clear button is clicked', () => {
    const onSearchClear = vi.fn()
    renderTodayFilters({ localSearchQuery: 'test', onSearchClear })
    fireEvent.click(screen.getByLabelText('common.clear'))
    expect(onSearchClear).toHaveBeenCalledTimes(1)
  })

  it('renders frequency filter chips', () => {
    renderTodayFilters()
    expect(screen.getByText('common.all')).toBeInTheDocument()
    expect(screen.getByText('Daily')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
  })

  it('calls onFrequencyChange when a frequency chip is clicked', () => {
    const onFrequencyChange = vi.fn()
    renderTodayFilters({ onFrequencyChange })
    fireEvent.click(screen.getByText('Daily'))
    expect(onFrequencyChange).toHaveBeenCalledWith('Day')
  })

  it('deselects frequency when clicking the active one', () => {
    const onFrequencyChange = vi.fn()
    renderTodayFilters({
      selectedFrequency: 'Day',
      onFrequencyChange,
    })
    fireEvent.click(screen.getByText('Daily'))
    expect(onFrequencyChange).toHaveBeenCalledWith(null)
  })

  it('calls onFrequencyChange(null) when "All" is clicked', () => {
    const onFrequencyChange = vi.fn()
    renderTodayFilters({
      selectedFrequency: 'Day',
      onFrequencyChange,
    })
    fireEvent.click(screen.getByText('common.all'))
    expect(onFrequencyChange).toHaveBeenCalledWith(null)
  })

  it('renders tag chips', () => {
    renderTodayFilters({
      tags: [
        { id: 't-1', name: 'Health', color: '#00ff00' },
        { id: 't-2', name: 'Work', color: '#0000ff' },
      ],
    })
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('calls onTagToggle when a tag chip is clicked', () => {
    const onTagToggle = vi.fn()
    renderTodayFilters({
      tags: [{ id: 't-1', name: 'Health', color: '#00ff00' }],
      onTagToggle,
    })
    fireEvent.click(screen.getByText('Health'))
    expect(onTagToggle).toHaveBeenCalledWith('t-1')
  })

  it('hides frequency chips in general view', () => {
    renderTodayFilters({
      activeView: 'general',
      tags: [{ id: 't-1', name: 'Health', color: '#00ff00' }],
    })
    expect(screen.queryByText('common.all')).not.toBeInTheDocument()
    expect(screen.queryByText('Daily')).not.toBeInTheDocument()
    // Tags should still be visible
    expect(screen.getByText('Health')).toBeInTheDocument()
  })

  it('calls onOpenControlsMenu when more button is clicked', () => {
    const onOpenControlsMenu = vi.fn()
    renderTodayFilters({ onOpenControlsMenu })
    fireEvent.click(screen.getByLabelText('habits.actions.more'))
    expect(onOpenControlsMenu).toHaveBeenCalledTimes(1)
  })
})
