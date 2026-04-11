import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

vi.mock('lucide-react', () => ({
  Inbox: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement('svg', { ...props, 'data-testid': 'inbox-icon' }),
}))

describe('EmptyState', () => {
  it('renders description text', () => {
    render(<EmptyState icon={Inbox} description="No items found" />)
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<EmptyState icon={Inbox} title="Empty" description="No items" />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('does not render title when not provided', () => {
    render(<EmptyState icon={Inbox} description="No items" />)
    expect(screen.queryByText('Empty')).not.toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={Inbox}
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
    render(<EmptyState icon={Inbox} description="No items" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders icon', () => {
    render(<EmptyState icon={Inbox} description="No items" />)
    expect(screen.getByTestId('inbox-icon')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(
      <EmptyState icon={Inbox} description="No items" className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders secondary variant action button', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={Inbox}
        description="No items"
        action={{ label: 'Learn More', onClick, variant: 'secondary' }}
      />,
    )
    const button = screen.getByText('Learn More')
    expect(button).toBeInTheDocument()
  })
})
