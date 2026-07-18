import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('leaves the well unflagged while the field is valid', () => {
    render(<FieldInput ariaLabel="Name" value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Name' })

    expect(input.parentElement).not.toHaveAttribute('data-invalid')
    expect(input).not.toHaveAttribute('data-invalid')
  })

  it('flags the well invalid so the ring turns bad without a second ring owner', () => {
    render(
      <FieldInput ariaLabel="Name" value="" onChange={() => {}} error="Required" />,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    const well = input.parentElement

    expect(well).toHaveAttribute('data-invalid', 'true')
    expect(input).not.toHaveAttribute('data-invalid')
  })

  it('renders a textarea in the same well when multiline', () => {
    render(
      <FieldInput ariaLabel="Notes" multiline rows={2} value="" onChange={() => {}} />,
    )
    const control = screen.getByRole('textbox', { name: 'Notes' })

    expect(control.tagName).toBe('TEXTAREA')
    expect(control).toHaveAttribute('rows', '2')
  })

  it('binds a react-hook-form registration in place of value and onChange', async () => {
    const changed: string[] = []
    render(
      <FieldInput
        ariaLabel="Title"
        registration={{
          name: 'title',
          ref: () => {},
          onBlur: async () => {},
          onChange: async (event: { target: { value: string } }) => {
            changed.push(event.target.value)
          },
        }}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(input).toHaveAttribute('name', 'title')

    await userEvent.type(input, 'ab')
    expect(changed).toEqual(['a', 'ab'])
  })

  it('renders a trailing action inside the well so it needs no absolute inset', () => {
    render(
      <FieldInput
        ariaLabel="Title"
        value=""
        onChange={() => {}}
        trailing={<button type="button">Suggest</button>}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Title' })
    const action = screen.getByRole('button', { name: 'Suggest' })

    expect(input.parentElement).toBe(action.parentElement)
  })
})
