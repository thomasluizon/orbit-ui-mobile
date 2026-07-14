import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

Element.prototype.scrollIntoView = vi.fn()

import { AppDatePicker } from '@/components/ui/app-date-picker'

describe('AppDatePicker', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the trigger button', () => {
    render(<AppDatePicker value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('common.selectDate')).toBeInTheDocument()
  })

  it('shows placeholder when no value', () => {
    render(<AppDatePicker value="" onChange={vi.fn()} placeholder="Pick date" />)
    expect(screen.getByText('Pick date')).toBeInTheDocument()
  })

  it('shows formatted date when value is set', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    expect(screen.getByText('06/15/2025')).toBeInTheDocument()
  })

  it('opens calendar dialog on click', () => {
    render(<AppDatePicker value="" onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('common.selectDate'))
    expect(document.querySelector('dialog')).toBeInTheDocument()
  })

  it('has previous and next month navigation', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
    expect(screen.getByLabelText('common.nextMonth')).toBeInTheDocument()
  })

  it('calls onChange when a day is clicked', () => {
    const onChange = vi.fn()
    render(<AppDatePicker value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    expect(dayButtons.length).toBeGreaterThan(0)
    fireEvent.click(dayButtons[10]!)
    expect(onChange).toHaveBeenCalled()
  })

  it('closes calendar after selecting a day', async () => {
    const onChange = vi.fn()
    render(<AppDatePicker value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    fireEvent.click(dayButtons[10]!)
    await waitFor(() =>
      expect(screen.queryByLabelText('common.previousMonth')).not.toBeInTheDocument(),
    )
  })

  it('renders weekday headers', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const headers = document.querySelectorAll('th')
    expect(headers).toHaveLength(7)
  })

  it('marks selected date with aria-pressed', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const selected = document.querySelector('[aria-pressed="true"]')
    expect(selected).toBeInTheDocument()
  })

  it('always renders six weeks (42 day cells) regardless of month length', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.querySelectorAll('tbody tr')).toHaveLength(6)
    expect(document.querySelectorAll('td button')).toHaveLength(42)
  })

  it('has no year-skip arrows, only a tappable year', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByLabelText('common.previousYear')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('common.nextYear')).not.toBeInTheDocument()
    expect(screen.getByLabelText('common.selectYear')).toBeInTheDocument()
  })

  it('opens a year picker from the year label', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    expect(screen.getByRole('button', { name: '2030' })).toBeInTheDocument()
  })

  it('jumps to a chosen year from the year picker', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    expect(screen.getByText('2027')).toBeInTheDocument()
    expect(screen.getByText('June')).toBeInTheDocument()
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
  })

  it('steps to the previous and next month', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('moves the roving focus target with arrow-key grid navigation', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = screen.getByRole('grid')

    expect(document.querySelector('button[tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15')

    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(document.querySelector('button[tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-16')

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(document.querySelector('button[tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-23')

    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(document.querySelector('button[tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15')
  })

  it('crosses month boundaries with PageUp/PageDown navigation', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = screen.getByRole('grid')

    fireEvent.keyDown(grid, { key: 'PageUp' })
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.keyDown(grid, { key: 'PageDown' })
    fireEvent.keyDown(grid, { key: 'PageDown' })
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('resyncs the visible month when the value prop changes', () => {
    const { rerender } = render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    rerender(<AppDatePicker value="2025-09-15" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('September')).toBeInTheDocument()
  })
})
