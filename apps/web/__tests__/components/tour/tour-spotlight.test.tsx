import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { TourSpotlight } from '@/components/tour/tour-spotlight'

describe('TourSpotlight', () => {
  it('renders a full-viewport scrim with no cutout when there is no target', () => {
    render(<TourSpotlight targetRect={null} />)
    expect(document.getElementById('tour-spotlight-mask')).not.toBeInTheDocument()
    const rects = document.body.querySelectorAll('svg rect')
    expect(rects).toHaveLength(1)
  })

  it('renders a masked cutout around the measured target rect', () => {
    render(<TourSpotlight targetRect={{ x: 100, y: 120, width: 40, height: 20 }} padding={8} />)
    const mask = document.getElementById('tour-spotlight-mask')
    expect(mask).toBeInTheDocument()
    const cutout = mask!.querySelector('rect:nth-of-type(2)')
    expect(cutout).toHaveAttribute('x', '92')
    expect(cutout).toHaveAttribute('y', '112')
    expect(cutout).toHaveAttribute('width', '56')
    expect(cutout).toHaveAttribute('height', '36')
  })

  it('keeps the last known rect when the target becomes null mid-tour', () => {
    const { rerender } = render(<TourSpotlight targetRect={{ x: 10, y: 10, width: 30, height: 30 }} />)
    rerender(<TourSpotlight targetRect={null} />)
    expect(document.getElementById('tour-spotlight-mask')).toBeInTheDocument()
  })
})
