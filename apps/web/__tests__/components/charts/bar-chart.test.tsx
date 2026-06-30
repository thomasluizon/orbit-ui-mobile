import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarChart } from '@/components/charts/bar-chart'

describe('BarChart', () => {
  it('renders a labeled row with the formatted value for each bar', () => {
    render(
      <BarChart
        bars={[
          { label: 'Water', value: 26 },
          { label: 'Read', value: 12 },
        ]}
        ariaLabel="comparison"
        formatValue={(value) => `${value} d`}
      />,
    )

    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('26 d')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('12 d')).toBeInTheDocument()
  })
})
