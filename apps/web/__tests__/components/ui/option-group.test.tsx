import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OptionCard, OptionGroup } from '@/components/ui/option-card'

afterEach(cleanup)

describe('the option group', () => {
  it('is a fieldset that the question names', () => {
    render(<OptionGroup label="Pick one"><OptionCard label="A" onSelect={vi.fn()} /></OptionGroup>)
    const group = screen.getByRole('group', { name: 'Pick one' })
    expect(group.tagName).toBe('FIELDSET')
    expect(group).not.toHaveAttribute('role')
    expect(group).toHaveAttribute('data-option-group')
  })

  it('shows one shared reason once, under the whole group', () => {
    const { container } = render(
      <OptionGroup label="Pick one">
        <OptionCard label="A" disabled disabledReason="Clear the list first" onSelect={vi.fn()} />
        <OptionCard label="B" disabled disabledReason="Clear the list first" onSelect={vi.fn()} />
      </OptionGroup>,
    )
    const reasons = container.querySelectorAll('[data-option-reason]')
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toHaveTextContent('Clear the list first')
    expect(screen.getByRole('group', { name: 'Pick one' }).contains(reasons[0]!)).toBe(false)
  })

  it('keeps the reason under its own option outside a group', () => {
    render(<OptionCard label="A" disabled disabledReason="Not now" onSelect={vi.fn()} />)
    expect(screen.getByText('Not now')).toBeInTheDocument()
  })
})
