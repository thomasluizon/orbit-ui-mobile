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

  it('renders the solid Astra asset instead of the retired orbital draft', () => {
    const { container } = render(<AstraMark />)
    expect(container.querySelector('svg')).toHaveAttribute('data-asset', 'astra-mark')
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(container.querySelector('circle')).toBeNull()
  })

  it('inherits currentColor when no color is given', () => {
    const { container } = render(<AstraMark />)
    expect(container.querySelector('svg')).toHaveAttribute('color', 'currentColor')
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })

  it('renders monochrome when a color is given', () => {
    const { container } = render(<AstraMark color="#123456" />)
    expect(container.querySelector('svg')).toHaveAttribute('color', '#123456')
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor')
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
