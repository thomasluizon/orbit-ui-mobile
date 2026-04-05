import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GoogleIcon } from '@/components/ui/google-icon'

describe('GoogleIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<GoogleIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<GoogleIcon className="size-5" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('size-5')
  })

  it('contains the four Google color paths', () => {
    const { container } = render(<GoogleIcon />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(4)

    const fills = Array.from(paths).map((p) => p.getAttribute('fill'))
    expect(fills).toContain('#4285F4')
    expect(fills).toContain('#34A853')
    expect(fills).toContain('#FBBC05')
    expect(fills).toContain('#EA4335')
  })
})
