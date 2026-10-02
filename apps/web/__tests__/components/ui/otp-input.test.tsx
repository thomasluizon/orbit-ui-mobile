import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from '@/components/ui/otp-input'

function Harness({
  onComplete,
  error,
}: Readonly<{ onComplete?: (value: string) => void; error?: string }>) {
  const [value, setValue] = useState('')
  return (
    <OtpInput
      id="test-code"
      label="Verification code"
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      error={error}
    />
  )
}

describe('web OtpInput', () => {
  it.each([undefined, 'Wrong code'])('tracks focus entering and leaving the active cell with error=%s', (error) => {
    const view = render(<><OtpInput label="Code" value="12" onChange={vi.fn()} autoFocus={false} error={error} /><button>Continue</button></>)
    const input = screen.getByRole('textbox')
    const cells = () => Array.from(document.querySelectorAll('[data-otp-cell]'))
    fireEvent.blur(input)
    expect(cells().filter((cell) => cell.hasAttribute('data-active'))).toHaveLength(0)
    fireEvent.focus(input)
    expect(cells()[2]).toHaveAttribute('data-active')
    expect(cells().filter((cell) => cell.hasAttribute('data-active'))).toHaveLength(1)
    if (error) expect(cells().filter((cell) => cell.hasAttribute('data-error'))).toHaveLength(6)
    view.rerender(<><OtpInput label="Code" value="123456" onChange={vi.fn()} autoFocus={false} error={error} /><button>Continue</button></>)
    expect(cells()[5]).toHaveAttribute('data-active')
    fireEvent.blur(input)
    expect(cells().filter((cell) => cell.hasAttribute('data-active'))).toHaveLength(0)
    expect(input).toHaveAttribute('name', 'verificationCode')
  })

  it('uses one real input for typing, autofill, and whole-code paste', () => {
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)
    const input = screen.getByLabelText('Verification code')

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.change(input, { target: { value: '12 a34-567' } })
    expect(input).toHaveValue('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('marks all six visual cells when the whole code is wrong', () => {
    render(<Harness error="Wrong code" />)
    expect(document.querySelectorAll('[data-otp-cell][data-error]')).toHaveLength(6)
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong code')
  })
})
