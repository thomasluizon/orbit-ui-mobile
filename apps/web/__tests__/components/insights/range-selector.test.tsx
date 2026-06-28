import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { RangeSelector } from '@/components/insights/range-selector'

describe('RangeSelector', () => {
  it('renders the four presets and marks the active one pressed', () => {
    render(<RangeSelector value="quarter" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'insights.rangeQuarter' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'insights.rangeWeek' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('calls onChange with the chosen preset', () => {
    const onChange = vi.fn()
    render(<RangeSelector value="month" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'insights.rangeYear' }))

    expect(onChange).toHaveBeenCalledWith('year')
  })
})
