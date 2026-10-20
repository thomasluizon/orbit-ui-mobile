import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { format } from 'date-fns'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

Element.prototype.scrollIntoView = vi.fn()

import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'

describe('DateField', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the trigger button', () => {
    render(<DateField value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('common.selectDate')).toBeInTheDocument()
  })

  it('shows placeholder when no value', () => {
    render(<DateField value="" onChange={vi.fn()} placeholder="Pick date" />)
    expect(screen.getByText('Pick date')).toBeInTheDocument()
  })

  it('keeps the empty selection prompt in the accessible name with a field label', () => {
    render(<DateField label="End date" value="" onChange={vi.fn()} placeholder="31/12/2026" />)
    expect(screen.getByRole('button', { name: 'End date, common.selectDate' })).toBeInTheDocument()
  })

  it('shows formatted date when value is set', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    expect(screen.getByText('06/15/2025')).toBeInTheDocument()
  })

  it('opens calendar dialog on click', async () => {
    render(<DateField value="" onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('common.selectDate'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it.each(['2025-06-15', ''])('focuses the roving day on open with value "%s"', async (value) => {
    render(<Sheet open title="Goal" onClose={vi.fn()}><DateField value={value} onChange={vi.fn()} /></Sheet>)
    const trigger = screen.getByRole('button', { name: value ? 'common.selectedDate' : 'common.selectDate' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus())
    fireEvent.click(trigger)

    const day = document.querySelector<HTMLButtonElement>(`button[data-day="${value || format(new Date(), 'yyyy-MM-dd')}"]`)
    expect(day).toHaveAttribute('tabindex', '0')
    await waitFor(() => expect(day).toHaveFocus())
  })

  it('has previous and next month navigation', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
    expect(screen.getByLabelText('common.nextMonth')).toBeInTheDocument()
  })

  it('calls onChange when a day is clicked', () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    expect(dayButtons.length).toBeGreaterThan(0)
    fireEvent.click(dayButtons[10]!)
    expect(onChange).toHaveBeenCalled()
  })

  it('closes calendar after selecting a day', async () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    fireEvent.click(dayButtons[10]!)
    await waitFor(() =>
      expect(screen.queryByLabelText('common.previousMonth')).not.toBeInTheDocument(),
    )
  })

  it('renders weekday headers', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const headers = document.querySelectorAll('th')
    expect(headers).toHaveLength(7)
  })

  /** Month controls fill their columns around the unchanged 32px visible circle. */
  it('gives every day control a 44 by 44 target around its 32px circle', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))

    const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('td button')]
    expect(dayButtons.length).toBeGreaterThan(0)

    for (const button of dayButtons) {
      expect(button.style.width).toBe('100%')
      expect(button.className).toContain('min-h-[var(--month-grid-touch-min)]')
      expect(button.className).not.toContain('size-8')
      expect(button.firstElementChild?.className).toContain('size-8')
    }
  })

  it('marks selected date with aria-pressed', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const selected = document.querySelector('[aria-pressed="true"]')
    expect(selected).toBeInTheDocument()
  })

  it('always renders six weeks (42 day cells) regardless of month length', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.querySelectorAll('tbody tr')).toHaveLength(6)
    expect(document.querySelectorAll('td button')).toHaveLength(42)
  })

  it('has no year-skip arrows, only a tappable year', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByLabelText('common.previousYear')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('common.nextYear')).not.toBeInTheDocument()
    expect(screen.getByLabelText('common.selectYear')).toBeInTheDocument()
  })

  it('opens a year picker from the year label', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    expect(screen.getByRole('button', { name: '2030' })).toBeInTheDocument()
  })

  it('fills every 48px year hit area on a 52px row pitch', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))

    const year = screen.getByRole('button', { name: '2030' })
    expect(year).toHaveClass('min-h-12', 'rounded-full', 'hover:bg-[var(--bg-hover)]')
    expect(year.firstElementChild).toBeNull()

    const grid = year.parentElement
    expect(grid?.style.gridAutoRows).toBe('minmax(48px, auto)')
    expect(grid?.style.rowGap).toBe('4px')
  })

  it('jumps to a chosen year from the year picker', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    expect(screen.getByText('2027')).toBeInTheDocument()
    expect(screen.getByText('June')).toBeInTheDocument()
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
  })


  it('preserves the date through year mode and commits a day only after year selection', async () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    expect(screen.getByRole('button', { name: 'June 15, 2025' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2030' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('June')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2030' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    expect(screen.getByText('May')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByRole('button', { name: 'June 15, 2030' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2030-06-15'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('steps to the previous and next month', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('moves the roving focus target with arrow-key grid navigation', async () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = await screen.findByRole('grid')

    await waitFor(() =>
      expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15'),
    )

    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-16')

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-23')

    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15')
  })

  it('crosses month boundaries with PageUp/PageDown navigation', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = screen.getByRole('grid')

    fireEvent.keyDown(grid, { key: 'PageUp' })
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.keyDown(grid, { key: 'PageDown' })
    fireEvent.keyDown(grid, { key: 'PageDown' })
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('resyncs the visible month when the value prop changes', () => {
    const { rerender } = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    rerender(<DateField value="2025-09-15" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('September')).toBeInTheDocument()
  })
})
