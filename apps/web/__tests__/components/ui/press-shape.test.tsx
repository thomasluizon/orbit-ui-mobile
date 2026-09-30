import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { DayCell } from '@/components/dates/day-cell'

const cellWords: DayCellWords = {
  none: 'none',
  partial: 'partial',
  full: 'full',
  notScheduled: 'not scheduled',
  of: 'of',
  today: 'today',
  readOnly: 'read only',
}

describe('painted press and hover shapes', () => {
  it('layers the day hover fill over the whole round hit area without hiding the outcome', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} loggable onPress={() => {}} />,
    )

    const hitArea = container.querySelector('button')
    expect(hitArea?.className).toContain('rounded-full')
    expect(hitArea?.className).toContain('overflow-hidden')

    const pressFill = hitArea?.querySelector('[data-press-fill]')
    expect(pressFill?.className).toContain('absolute inset-0')
    expect(pressFill?.className).toContain('rounded-full')
    expect(pressFill?.className).toContain('bg-[var(--bg-hover)]')
    expect(pressFill?.className).toContain('group-hover:opacity-100')
    expect(pressFill?.className).toContain('pointer-events-none')
    expect(pressFill).toHaveAttribute('aria-hidden', 'true')
    expect(hitArea?.lastElementChild).toBe(pressFill)
    expect(container.querySelector('[data-outcome="full"] span')).toHaveStyle({ background: 'var(--fg-1)' })
  })

  it('gives a read-only day no press fill', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} />,
    )

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[data-press-fill]')).toBeNull()
    expect(container.querySelector('[data-outcome="full"] span')).toHaveStyle({ background: 'var(--fg-1)' })
  })
})
