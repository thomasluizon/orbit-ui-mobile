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
  it('keeps a loggable completed day fill on the button that owns the hit area', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} loggable onPress={() => {}} />,
    )

    const hitArea = container.querySelector('button')
    expect(hitArea?.className).toContain('rounded-full')
    expect(hitArea?.className).toContain('bg-[var(--fg-1)]')
    expect(hitArea?.className).toContain('hover:bg-[var(--bg-hover)]')
    expect(hitArea?.className).toContain('group')
    expect(hitArea?.querySelector('span')).toHaveStyle({ background: 'transparent' })
    expect(hitArea?.querySelector('span span')?.className).toContain('group-hover:text-[var(--fg-1)]')
  })

  it('leaves a read-only completed day fill on its own disc', () => {
    const { container } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} />,
    )

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[data-outcome="full"] span')).toHaveStyle({ background: 'var(--fg-1)' })
  })
})
