import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/ui/progress-bar'

describe('ProgressBar', () => {
  it('exposes progress through the progressbar role', () => {
    render(<ProgressBar progress={0.5} label="Daily progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Daily progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('clamps progress above 1', () => {
    render(<ProgressBar progress={1.5} label="Overflow" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('clamps progress below 0', () => {
    render(<ProgressBar progress={-0.5} label="Underflow" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
