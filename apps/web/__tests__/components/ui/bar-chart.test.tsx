import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BarChart } from '@/components/ui/bar-chart'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { done: number; scheduled: number }) =>
    key === 'readout' ? `${values?.done} of ${values?.scheduled}` : key,
}))

const points = Array.from({ length: 7 }, (_, index) => ({
  dateLabel: `Sep ${index + 1}`,
  rate: index === 0 ? null : 50,
  scheduled: index === 0 ? 0 : 2,
  completed: index === 0 ? 0 : 1,
}))

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { this.callback([{ contentRect: { width: 320 } }]) }
    disconnect() {}
    constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  })
})

describe('BarChart on web', () => {
  it('renders one row per point and changes selection with the keyboard', () => {
    const { container } = render(<BarChart points={points} label="Last 30 days" />)
    expect(screen.getAllByRole('row')).toHaveLength(points.length + 1)
    expect(container.querySelectorAll('svg path')).toHaveLength(7)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '7')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', '2')
    expect(container.querySelector('path[data-state="empty"]')).toHaveAttribute('fill', 'var(--track-empty)')
    expect(container.querySelector('path[data-state="selected"]')).toHaveAttribute('fill', 'var(--fg-1)')
    expect(container.querySelector('path[data-state="resting"]')).toHaveAttribute('fill', 'var(--fg-2)')
  })

  it('keeps the selected value in range when the series shrinks', () => {
    const { rerender } = render(<BarChart points={points} label="Last 30 days" />)
    rerender(<BarChart points={points.slice(0, 2)} label="Last 30 days" />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '2')
  })
})
