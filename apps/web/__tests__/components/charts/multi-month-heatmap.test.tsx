import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

import { MultiMonthHeatmap } from '@/components/charts/multi-month-heatmap'

function daysBetween(from: string, to: string) {
  const days: { date: string; value: number }[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor.getTime() <= end.getTime()) {
    days.push({ date: cursor.toISOString().slice(0, 10), value: 1 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

describe('MultiMonthHeatmap', () => {
  it('labels the first week column of each month in the range', () => {
    render(
      <MultiMonthHeatmap
        days={daysBetween('2026-05-01', '2026-06-28')}
        ariaLabel="Heatmap"
      />,
    )

    expect(screen.getByText('May')).toBeInTheDocument()
    expect(screen.getByText('Jun')).toBeInTheDocument()
  })

  it('places days on rows honoring the week start preference', () => {
    const monday = '2026-06-01'
    const { container: sundayFirst } = render(
      <MultiMonthHeatmap days={[{ date: monday, value: 1 }]} ariaLabel="Heatmap" weekStartsOn={0} />,
    )
    const { container: mondayFirst } = render(
      <MultiMonthHeatmap days={[{ date: monday, value: 1 }]} ariaLabel="Heatmap" weekStartsOn={1} />,
    )

    const sundayFirstCell = sundayFirst.querySelector('rect')
    const mondayFirstCell = mondayFirst.querySelector('rect')
    const rowOf = (cell: Element | null) =>
      cell ? Number(cell.getAttribute('y')) : Number.NaN

    expect(rowOf(mondayFirstCell)).toBeLessThan(rowOf(sundayFirstCell))
  })

  it('announces the chart through its accessible label and renders nothing for empty data', () => {
    render(<MultiMonthHeatmap days={[]} ariaLabel="Heatmap" />)

    const chart = screen.getByRole('img', { name: 'Heatmap' })
    expect(chart).toBeEmptyDOMElement()
  })
})
