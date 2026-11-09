import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { CalendarEntryDetails } from '@/components/calendar/calendar-entry-details'

describe('CalendarEntryDetails search miss', () => {
  it('starts the clear glyph on the message column', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><CalendarEntryDetails entries={[]} title="Entries" displayTime={(time) => time} onClose={vi.fn()} /></NextIntlClientProvider>)
    const clear = screen.getByRole('button', { name: en.calendar.dayDetail.clearEventSearch })
    expect(clear.parentElement?.querySelector('p')).toHaveStyle({ margin: '0px' })
    expect(clear).toHaveStyle({ width: '44px', marginInlineStart: `${-(44 - 20) / 2}px` })
  })
})
