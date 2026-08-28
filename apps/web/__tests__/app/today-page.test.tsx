import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayDateControl } from '@/app/(app)/today-shell'

vi.mock('@/components/ui/icons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/icons')>()),
  ChevronLeft: () => null,
  ChevronRight: () => null,
  MoreVertical: () => null,
}))

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ open, items, onSelect }: any) => open ? (
    <div role="menu">
      {items.map((item: any) => (
        <button key={item.id} role="menuitem" onClick={() => onSelect(item.id)}>{item.label}</button>
      ))}
    </div>
  ) : null,
}))

const baseProps = {
  dayName: 'Wednesday',
  numericDate: '08/04/2026',
  isTodaySelected: true,
  nextDisabled: false,
  onGoToPreviousDay: vi.fn(),
  onGoToToday: vi.fn(),
  onGoToNextDay: vi.fn(),
  previousLabel: 'Previous day',
  todayLabel: 'Today',
  nextLabel: 'Next day',
  moreLabel: 'More actions',
  selectLabel: 'Select',
  collapseLabel: 'Collapse all',
  refreshLabel: 'Refresh',
  completedLabel: 'Show completed',
  isFetching: false,
  onToggleSelect: vi.fn(),
  onToggleCollapse: vi.fn(),
  onRefresh: vi.fn(),
  onToggleCompleted: vi.fn(),
}

describe('Hoje date control', () => {
  it('shows the day name over the numeric date', () => {
    render(<TodayDateControl {...baseProps} />)
    expect(screen.getByText('Wednesday')).toBeInTheDocument()
    expect(screen.getByText('08/04/2026')).toBeInTheDocument()
  })

  it('shows the jump only away from today', () => {
    const onGoToToday = vi.fn()
    render(<TodayDateControl {...baseProps} isTodaySelected={false} onGoToToday={onGoToToday} />)
    fireEvent.click(screen.getByText('Today'))
    expect(onGoToToday).toHaveBeenCalledOnce()
  })

  it('disables the forward step at the instance horizon', () => {
    render(<TodayDateControl {...baseProps} nextDisabled />)
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  it('opens the four list actions from the date row', () => {
    render(<TodayDateControl {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))

    expect(screen.getByRole('menuitem', { name: 'Select' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Collapse all' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Show completed' })).toBeInTheDocument()
  })
})
