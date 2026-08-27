import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '@/components/ui/progress-bar'

describe('ProgressBar', () => {
  it('exposes progress through the progressbar role', () => {
    render(<ProgressBar value={0.5} max={1} label="Daily progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Daily progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '0.5')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1')
  })

  it('clamps progress above 1', () => {
    render(<ProgressBar value={1.5} max={1} label="Overflow" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it('clamps progress below 0', () => {
    render(<ProgressBar value={-0.5} max={1} label="Underflow" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('uses accent while unfinished and neutral at completion', () => {
    const { container, rerender } = render(<ProgressBar value={50} max={100} label="Progress" />)
    expect(container.querySelector('[role="progressbar"] > div')).toHaveStyle({
      background: 'var(--primary)',
    })

    rerender(<ProgressBar value={100} max={100} label="Progress" />)
    expect(container.querySelector('[role="progressbar"] > div')).toHaveStyle({
      background: 'var(--fg-3)',
    })
  })
})
