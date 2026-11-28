import { expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { PROGRESS_SUBMENUS } from '../utils/progress-navigation'

function wordsAt(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
}

it('keeps the progress destinations in display order, each on the route of its id', () => {
  expect(PROGRESS_SUBMENUS.map(({ id }) => id)).toEqual(['streak', 'goals', 'achievements'])
  expect(PROGRESS_SUBMENUS.map(({ route }) => route)).toEqual(PROGRESS_SUBMENUS.map(({ id }) => `/progress/${id}`))
})

it.each([['en', en], ['pt-BR', ptBR]])('gives each progress destination its words in %s', (_locale, messages) => {
  const keys = PROGRESS_SUBMENUS.flatMap(({ labelKey, descriptionKey }) => descriptionKey ? [labelKey, descriptionKey] : [labelKey])

  expect(keys.filter((key) => !wordsAt(messages, key))).toEqual([])
})
