import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

let uses24HourClock = true

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => (uses24HourClock ? 'pt-BR' : 'en-US'),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { uses24HourClock } }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { TimeField } from '@/components/ui/time-field'

/** The trigger is labelled by its current value, so open it by position. */
function openPicker() {
  fireEvent.click(screen.getAllByRole('button')[0]!)
}

function pickOption(columnLabel: string, label: string) {
  const column = screen.getByRole('radiogroup', { name: columnLabel })
  fireEvent.click(within(column).getByRole('radio', { name: label }))
}

describe('TimeField', () => {
  it('offers every minute, so an odd minute like 07:13 is selectable in a 24-hour locale', () => {
    uses24HourClock = true
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    pickOption('common.hours', '07')
    pickOption('common.minutes', '13')
    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))

    expect(onChange).toHaveBeenCalledWith('07:13')
  })

  it('keeps the canonical HH:MM value for an odd minute picked in a 12-hour locale', () => {
    uses24HourClock = false
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    pickOption('common.hours', '09')
    pickOption('common.minutes', '45')
    pickOption('common.amPm', 'PM')
    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))

    expect(onChange).toHaveBeenCalledWith('21:45')
  })

  it('opens on the persisted odd minute rather than snapping it to a half hour', () => {
    uses24HourClock = true
    render(<TimeField value="07:15" onChange={vi.fn()} />)

    openPicker()

    const hours = screen.getByRole('radiogroup', { name: 'common.hours' })
    const minutes = screen.getByRole('radiogroup', { name: 'common.minutes' })
    expect(within(hours).getByRole('radio', { name: '07' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(minutes).getByRole('radio', { name: '15' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('offers all sixty minutes, not a half-hour subset', () => {
    uses24HourClock = true
    render(<TimeField value="07:15" onChange={vi.fn()} />)

    openPicker()

    const minutes = screen.getByRole('radiogroup', { name: 'common.minutes' })
    expect(within(minutes).getAllByRole('radio')).toHaveLength(60)
  })

  it('uses one tab stop and wraps arrow selection within each time column', () => {
    uses24HourClock = true
    const onChange = vi.fn()
    render(<TimeField value="14:30" onChange={onChange} />)

    openPicker()
    const hours = screen.getByRole('radiogroup', { name: 'common.hours' })
    const options = within(hours).getAllByRole('radio')
    const selected = within(hours).getByRole('radio', { name: '14' })

    expect(options.filter((option) => option.tabIndex === 0)).toEqual([selected])
    selected.focus()
    fireEvent.keyDown(selected, { key: 'End' })
    const lastHour = within(hours).getByRole('radio', { name: '23' })
    expect(lastHour).toHaveFocus()
    expect(lastHour).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    const firstHour = within(hours).getByRole('radio', { name: '00' })
    expect(firstHour).toHaveFocus()
    expect(firstHour).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'common.done' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('00:30')
  })
})
