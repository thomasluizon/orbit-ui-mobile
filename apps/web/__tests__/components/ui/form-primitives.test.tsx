import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { DateRow } from '@/components/ui/date-row'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { uses24HourClock: true } }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
}))

describe('form primitives on web', () => {
  it('renders labelled single and multiline inputs with their shared limits', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Input label="Habit name" value="Walk" onChange={onChange} maxLength={60} />,
    )
    const input = screen.getByRole('textbox', { name: 'Habit name' })
    expect(input).toHaveAttribute('maxlength', '60')
    fireEvent.change(input, { target: { value: 'Walk outside' } })
    expect(onChange).toHaveBeenCalledWith('Walk outside')

    rerender(
      <Input
        label="Description"
        value="One line"
        onChange={onChange}
        multiline
        rows={4}
        maxLength={120}
      />,
    )
    const textarea = screen.getByRole('textbox', { name: 'Description' })
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveAttribute('rows', '4')
    expect(textarea).toHaveAttribute('maxlength', '120')
  })

  it('uses one real OTP input and derives all six painted cells from its value', () => {
    const onChange = vi.fn()
    const { container } = render(
      <OtpInput label="Verification code" value="12" onChange={onChange} error="Wrong code" />,
    )
    const input = screen.getByRole('textbox', { name: 'Verification code' })
    expect(container.querySelectorAll('input')).toHaveLength(1)
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).not.toHaveAttribute('maxlength')
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(6)
    expect(screen.getAllByText('Wrong code')).toHaveLength(1)

    fireEvent.change(input, { target: { value: '123 456' } })
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('keeps Checkbox interactive or paint only without using the accent for completion', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(
      <Checkbox checked onChange={onChange} label="Done" />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Done' }))
    expect(onChange).toHaveBeenCalledWith(false)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({
      background: 'var(--status-done)',
    })

    rerender(<Checkbox checked={false} onChange={onChange} as="span" />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('makes the full CheckRow the one control and replaces its description with an error', () => {
    const onChange = vi.fn()
    render(
      <CheckRow
        label="Drink water"
        checked={false}
        onChange={onChange}
        description="Before lunch"
        error="Choose a time"
        value={2}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Drink water' }))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByText('Choose a time')).toBeInTheDocument()
    expect(screen.queryByText('Before lunch')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('reports Switch state and passes the next state', () => {
    const onChange = vi.fn()
    render(<Switch label="Reminders" checked={false} onChange={onChange} />)
    const control = screen.getByRole('switch', { name: 'Reminders' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('keeps TimeField values in 24 hour wire format at the input boundary', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <TimeField label="Exact time" value="19:30" onChange={onChange} hourCycle="h12" />,
    )
    const input = screen.getByLabelText('Exact time')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('data-hour-cycle', 'h12')
    expect(input).toHaveValue('7:30 pm')
    fireEvent.change(input, { target: { value: '7:45 am' } })
    expect(onChange).toHaveBeenCalledWith('07:45')

    fireEvent.blur(input)
    rerender(<TimeField label="Exact time" value="19:30" onChange={onChange} />)
    expect(screen.getByLabelText('Exact time')).toHaveAttribute('data-hour-cycle', 'h23')
    expect(screen.getByLabelText('Exact time')).toHaveValue('19:30')
  })

  it('renders DateRow only as formatted text with its fixed-date note', () => {
    render(
      <DateRow
        label="Start date"
        value="Aug 28, 2026"
        note="The start date does not change."
      />,
    )
    expect(screen.getByText('Aug 28, 2026')).toBeInTheDocument()
    expect(screen.getByText('The start date does not change.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
