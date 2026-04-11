import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SurfaceCard } from '@/components/ui/surface-card'

describe('SurfaceCard', () => {
  it('renders children inside a div by default', () => {
    render(<SurfaceCard>Hello</SurfaceCard>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('uses the "as" prop to render a different element', () => {
    render(<SurfaceCard as="section">Content</SurfaceCard>)
    const el = screen.getByText('Content')
    expect(el.tagName).toBe('SECTION')
  })

  it('applies default variant classes', () => {
    const { container } = render(<SurfaceCard>Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('bg-surface')
  })

  it('applies elevated variant classes', () => {
    const { container } = render(<SurfaceCard variant="elevated">Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('bg-surface-elevated')
  })

  it('applies interactive variant classes', () => {
    const { container } = render(<SurfaceCard variant="interactive">Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('cursor-pointer')
  })

  it('applies glass variant classes', () => {
    const { container } = render(<SurfaceCard variant="glass">Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('backdrop-blur-[24px]')
  })

  it('applies selection variant with active state', () => {
    const { container } = render(
      <SurfaceCard variant="selection" active>
        Content
      </SurfaceCard>,
    )
    expect(container.firstChild).toHaveClass('border-primary')
  })

  it('applies selection variant without active state', () => {
    const { container } = render(
      <SurfaceCard variant="selection" active={false}>
        Content
      </SurfaceCard>,
    )
    expect(container.firstChild).toHaveClass('border-border-muted')
  })

  it('applies default padding', () => {
    const { container } = render(<SurfaceCard>Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('p-5')
  })

  it('applies compact padding', () => {
    const { container } = render(<SurfaceCard padding="compact">Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('p-4')
  })

  it('applies no padding', () => {
    const { container } = render(<SurfaceCard padding="none">Content</SurfaceCard>)
    expect(container.firstChild).toHaveClass('p-0')
  })

  it('passes additional props through', () => {
    render(
      <SurfaceCard data-testid="my-card" id="card-1">
        Content
      </SurfaceCard>,
    )
    expect(screen.getByTestId('my-card')).toBeInTheDocument()
  })

  it('merges custom className', () => {
    const { container } = render(
      <SurfaceCard className="custom-class">Content</SurfaceCard>,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
