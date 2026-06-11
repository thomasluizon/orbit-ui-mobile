import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'

describe('EmptyState', () => {
  it('renders description text', () => {
    render(<EmptyState description="No items found" />)
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<EmptyState title="Empty" description="No items" />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('does not render title when not provided', () => {
    render(<EmptyState description="No items" />)
    expect(screen.queryByText('Empty')).not.toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        description="No items"
        action={{ label: 'Create', onClick }}
      />,
    )
    const button = screen.getByText('Create')
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not render action button when not provided', () => {
    render(<EmptyState description="No items" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the satellite glyph', () => {
    const { container } = render(<EmptyState description="No items" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('applies className', () => {
    const { container } = render(
      <EmptyState description="No items" className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders secondary variant action button', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        description="No items"
        action={{ label: 'Learn More', onClick, variant: 'secondary' }}
      />,
    )
    const button = screen.getByText('Learn More')
    expect(button).toBeInTheDocument()
  })
})
