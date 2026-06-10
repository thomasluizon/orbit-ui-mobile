import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

describe('SatelliteGlyph', () => {
  it('renders a 96px svg by default', () => {
    const { container } = render(<SatelliteGlyph />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('width', '96')
    expect(svg).toHaveAttribute('height', '96')
  })

  it('respects the size prop', () => {
    const { container } = render(<SatelliteGlyph size={48} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '48')
  })
})
