import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'
import { Lock } from '@/components/ui/icons'

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
    const button = screen.getByRole('button', { name: 'Learn More' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('uses the satellite lockup by default', () => {
    const { container } = render(<EmptyState description="No items" />)
    expect(container.firstChild).toHaveAttribute('data-empty-state', 'satellite')
  })

  it('uses the icon disc lockup when an icon is provided', () => {
    const { container } = render(<EmptyState description="Locked" icon={Lock} />)
    expect(container.firstChild).toHaveAttribute('data-empty-state', 'icon')
  })

  it('renders a navigating CTA as a link when the action has an href', () => {
    render(
      <EmptyState
        description="Locked"
        icon={Lock}
        action={{ label: 'Upgrade', href: '/upgrade' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/upgrade')
  })

  it('does not fire a disabled action', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        description="No items"
        action={{ label: 'Generate', onClick, disabled: true }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders footer content alongside the action', () => {
    render(
      <EmptyState
        description="Locked"
        action={{ label: 'Retry', onClick: vi.fn() }}
        footer={<span>Portal unavailable</span>}
      />,
    )
    expect(screen.getByText('Portal unavailable')).toBeInTheDocument()
  })

  it('matches action/footer pill widths only when matchActionFooterWidth is set', () => {
    render(
      <EmptyState
        description="Empty"
        action={{ label: 'Ask Astra', onClick: vi.fn() }}
        footer={<span>Create</span>}
        matchActionFooterWidth
      />,
    )
    const wrapper = screen.getByRole('button', { name: 'Ask Astra' }).parentElement
    expect(wrapper).toHaveClass('grid')
    expect(wrapper).not.toHaveClass('flex')
  })

  it('keeps the default hug layout when matchActionFooterWidth is not set', () => {
    render(
      <EmptyState
        description="Empty"
        action={{ label: 'Ask Astra', onClick: vi.fn() }}
        footer={<span>Create</span>}
      />,
    )
    const wrapper = screen.getByRole('button', { name: 'Ask Astra' }).parentElement
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).not.toHaveClass('grid')
  })
})
