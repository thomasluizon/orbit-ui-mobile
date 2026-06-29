import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendLine } from '@/components/charts/trend-line'

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

    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('06-01')).toBeInTheDocument()
    expect(screen.getByText('06-28')).toBeInTheDocument()
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

    expect(screen.queryByText('2026-06-01')).toBeNull()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})
