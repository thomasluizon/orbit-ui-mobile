import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'
import { searchCommands } from '../utils/search-commands'

function translator(locale: typeof en | typeof pt) {
  const labels = Object.fromEntries(
    ['command', 'nav'].flatMap((namespace) =>
      Object.entries(locale[namespace as 'command' | 'nav'])
        .map(([key, value]) => [`${namespace}.${key}`, value]),
    ),
  )
  return (key: string): string => labels[key] as string
}

describe.each([{ locale: en, name: 'en' }, { locale: pt, name: 'pt-BR' }])('searchCommands in $name', ({ locale }) => {
  const translate = translator(locale)

  it('offers create, actions and destinations in order when resting', () => {
    expect(searchCommands('', null, translate).map(({ id, group }) => ({ id, group }))).toEqual([
      { id: 'create', group: 'create' },
      { id: 'log', group: 'actions' },
      { id: 'skip', group: 'actions' },
      { id: 'today', group: 'destinations' },
      { id: 'calendar', group: 'destinations' },
      { id: 'progress', group: 'destinations' },
      { id: 'profile', group: 'destinations' },
    ])
  })

  it('matches translated labels with surrounding whitespace and different case', () => {
    expect(searchCommands(`  ${locale.nav.calendar.toLocaleUpperCase()}  `, null, translate)).toEqual([
      { id: 'calendar', group: 'destinations', label: 'nav.calendar' },
    ])
  })

  it('returns no commands for a query with no matching label', () => {
    expect(searchCommands('zzzzzz', null, translate)).toEqual([])
  })

  it.each(['log', 'skip'] as const)('keeps top-level commands out of the %s habit picker', (page) => {
    expect(searchCommands('', page, translate)).toEqual([])
  })
})
