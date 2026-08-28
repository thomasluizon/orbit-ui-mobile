import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldInput } from '@/components/ui/field-input'

describe('FieldInput', () => {
  it('renders an accessible text input', () => {
    render(<FieldInput ariaLabel="Name" value="" onChange={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })

  it('marks the input invalid and links the error caption when error is set', () => {
    render(
      <FieldInput ariaLabel="Name" value="" onChange={() => {}} error="Required" />,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    const caption = screen.getByText('Required')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(caption.id)
  })

  it('does not mark the input invalid without an error', () => {
    render(<FieldInput ariaLabel="Name" value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the native input inside the single focus-ring well', () => {
    render(<FieldInput ariaLabel="Search" value="A long value" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Search' })
    const well = input.parentElement

    expect(input.style.border).toBe('0px')
    expect(input.style.minWidth).toBe('0px')
    expect(input.style.outline).toBe('none')
    expect(input.style.width).toBe('0px')
    expect(well).toHaveClass('min-w-0', 'w-full', 'max-w-full', 'focus-within:shadow-[inset_0_0_0_2px_var(--primary)]')
  })
})
