import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendLine } from '@/components/charts/trend-line'

const IGNORE_HIDDEN = 'script, style, [aria-hidden="true"], [aria-hidden="true"] *'

describe('TrendLine', () => {
  it('formats the y-axis ticks and renders a date x-axis when given a label formatter', () => {
    render(
      <TrendLine
        points={[
          { label: '2026-06-01', value: 0 },
          { label: '2026-06-28', value: 100 },
        ]}
        ariaLabel="trend"
        formatValue={(value) => `${value}%`}
        formatLabel={(date) => date.slice(5)}
      />,
    )

    expect(screen.getByText('100%', { ignore: IGNORE_HIDDEN })).toBeInTheDocument()
    expect(screen.getByText('0%', { ignore: IGNORE_HIDDEN })).toBeInTheDocument()
    expect(screen.getByText('06-01', { ignore: IGNORE_HIDDEN })).toBeInTheDocument()
    expect(screen.getByText('06-28', { ignore: IGNORE_HIDDEN })).toBeInTheDocument()
  })

  it('omits the x-axis when no label formatter is given', () => {
    render(
      <TrendLine
        points={[
          { label: '2026-06-01', value: 4 },
          { label: '2026-06-02', value: 8 },
        ]}
        ariaLabel="trend"
      />,
    )

    expect(screen.queryByText('2026-06-01', { ignore: IGNORE_HIDDEN })).toBeNull()
    expect(screen.getByText('8', { ignore: IGNORE_HIDDEN })).toBeInTheDocument()
  })
})
