import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AstraMark, AstraAvatar } from '@/components/ui/astra-avatar'

describe('AstraMark', () => {
  it('renders a 24px svg by default', () => {
    const { container } = render(<AstraMark />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('respects the size prop', () => {
    const { container } = render(<AstraMark size={40} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '40')
  })

  it('draws the ring, trail, satellite and core', () => {
    const { container } = render(<AstraMark />)
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    expect(container.querySelector('path')).not.toBeNull()
  })

  it('uses the violet/hairline duotone when no color is given', () => {
    const { container } = render(<AstraMark />)
    const ring = container.querySelector('circle[stroke]')
    expect(ring).toHaveAttribute('stroke', 'var(--fg-4)')
  })

  it('renders monochrome when a color is given (icon contexts)', () => {
    const { container } = render(<AstraMark color="currentColor" />)
    const ring = container.querySelector('circle[stroke]')
    expect(ring).toHaveAttribute('stroke', 'currentColor')
  })

  it('adds the orbit animation class only when animated', () => {
    const { container, rerender } = render(<AstraMark />)
    expect(container.querySelector('svg')).not.toHaveClass('astra-orbit')
    rerender(<AstraMark animate />)
    expect(container.querySelector('svg')).toHaveClass('astra-orbit')
  })
})

describe('AstraAvatar', () => {
  it('is decorative (hidden from assistive tech) without a label', () => {
    const { container } = render(<AstraAvatar />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('exposes an accessible image when labelled', () => {
    render(<AstraAvatar label="Astra avatar" />)
    expect(screen.getByRole('img', { name: 'Astra avatar' })).toBeInTheDocument()
  })

  it('applies a custom class', () => {
    const { container } = render(<AstraAvatar className="custom" />)
    expect(container.firstChild).toHaveClass('custom')
  })
})
