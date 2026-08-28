import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from '@/components/ui/code-input'

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
