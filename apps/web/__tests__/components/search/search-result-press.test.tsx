import { NextIntlClientProvider } from 'next-intl'
import { render } from '@testing-library/react'
import { Command } from 'cmdk'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildSearchSections } from '@orbit/shared/utils'
import { SearchResults } from '@/components/search/search-results'

describe('search page result row press', () => {
  it('paints its hover fill while pressed, so a touch press shows the fill the mobile row paints', () => {
    const habit = createMockHabit({ id: 'walk', title: 'Walk' })
    render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Command shouldFilter={false} disablePointerSelection><Command.List>
        <SearchResults sections={buildSearchSections([{ habit, parentTitle: null }])} today="2026-11-13" totalCount={1} query="Walk" onOpen={vi.fn()} />
      </Command.List></Command>
    </NextIntlClientProvider>)
    const row = document.querySelector('[data-command-result]')!
    const hoverFill = [...row.classList].find((name) => /(?:^|:)hover:bg-\[/.test(name))
    expect(hoverFill, 'the row paints the neutral hover fill').toBe('data-[selected=false]:hover:bg-[var(--bg-hover)]')
    expect(row, 'a touch press, which never hovers, paints the same fill').toHaveClass(hoverFill!.replace(/(^|:)hover:/, '$1active:'))
    expect([...row.classList].filter((name) => /(?:^|:)active:scale-/.test(name)), 'neither platform scales this row').toEqual([])
  })
})
