import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from '@/components/ui/input'

describe.each([false, true])('Input required state with multiline %s', (multiline) => {
  it.each([undefined, false, true])('renders required state %s on the control', (required) => {
    render(multiline
      ? <Input label="Message" value="" onChange={vi.fn()} required={required} multiline />
      : <Input label="Message" value="" onChange={vi.fn()} required={required} />)
    const control = screen.getByRole('textbox', { name: 'Message' })
    expect(control.hasAttribute('required')).toBe(required === true)
    expect(control).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('Message')).toHaveTextContent(/^Message$/)
  })

  it('preserves required state and linked error and hint when disabled', () => {
    render(multiline
      ? <Input label="Message" value="" onChange={vi.fn()} required disabled error="Enter a message" hint="Your draft stays here" multiline />
      : <Input label="Message" value="" onChange={vi.fn()} required disabled error="Enter a message" hint="Your draft stays here" />)
    const control = screen.getByRole('textbox', { name: 'Message' })
    expect(control).toBeRequired()
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(control).toHaveAccessibleDescription('Enter a message Your draft stays here')
  })
})
