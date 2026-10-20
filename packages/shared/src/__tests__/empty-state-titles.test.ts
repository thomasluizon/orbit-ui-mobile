import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { emptyStateTitles } from './empty-state-titles'

function messageAt(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined),
    messages,
  )
}

describe('emptyStateTitles', () => {
  it('reads every empty state title from the catalog key it names, in both locales', () => {
    for (const messages of [en, ptBR as typeof en]) {
      for (const { key, title } of emptyStateTitles(messages)) {
        expect(title).toBe(messageAt(messages, key))
        expect(title.trim()).not.toBe('')
      }
    }
  })

  it('keeps titles free of a trailing period and lists each key once', () => {
    const entries = emptyStateTitles(ptBR as typeof en)
    expect(new Set(entries.map(({ key }) => key)).size).toBe(entries.length)
    for (const { title } of [...entries, ...emptyStateTitles(en)]) expect(title).not.toMatch(/\.$/)
  })
})
