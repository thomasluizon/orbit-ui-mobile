import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PillToggle } from '@/components/ui/pill-toggle'

const options = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
] as const

describe('PillToggle', () => {
  it('renders all options', () => {
    render(
      <PillToggle
        options={[...options]}
        value="all"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('marks the active option with aria-pressed', () => {
    render(
      <PillToggle
        options={[...options]}
        value="active"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Active')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('All')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Completed')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked option value', () => {
    const onChange = vi.fn()
    render(
      <PillToggle
        options={[...options]}
        value="all"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('Completed'))
    expect(onChange).toHaveBeenCalledWith('completed')
  })

  it('applies className', () => {
    const { container } = render(
      <PillToggle
        options={[...options]}
        value="all"
        onChange={vi.fn()}
        className="my-class"
      />,
    )
    expect(container.firstChild).toHaveClass('my-class')
  })

  it('supports small size', () => {
    render(
      <PillToggle
        options={[...options]}
        value="all"
        onChange={vi.fn()}
        size="sm"
      />,
    )
    // Should render without error and all buttons present
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
