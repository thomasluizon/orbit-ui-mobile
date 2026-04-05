import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

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
    // Click a day cell with aria-pressed
    const dayButtons = document.querySelectorAll('td button')
    expect(dayButtons.length).toBeGreaterThan(0)
    fireEvent.click(dayButtons[10]!)
    expect(onChange).toHaveBeenCalled()
  })

  it('closes calendar after selecting a day', () => {
    const onChange = vi.fn()
    render(<AppDatePicker value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    fireEvent.click(dayButtons[10]!)
    // Dialog should be closed
    expect(screen.queryByLabelText('common.previousMonth')).not.toBeInTheDocument()
  })

  it('renders weekday headers', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const headers = document.querySelectorAll('th')
    expect(headers.length).toBe(7)
  })

  it('marks selected date with aria-pressed', () => {
    render(<AppDatePicker value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const selected = document.querySelector('[aria-pressed="true"]')
    expect(selected).toBeInTheDocument()
  })
})
