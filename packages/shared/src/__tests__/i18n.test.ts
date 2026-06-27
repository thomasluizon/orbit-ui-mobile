import { describe, expect, it } from 'vitest'
import {
  defaultLocale,
  loadLocale,
  supportedLocales,
} from '../i18n'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

type JsonValue = string | { [key: string]: JsonValue }

function flatten(value: JsonValue, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof value === 'string') {
    out.set(prefix, value)
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    for (const [leafPath, leafValue] of flatten(child, path)) {
      out.set(leafPath, leafValue)
    }
  }
  return out
}

function placeholderNames(value: string): Set<string> {
  const names = new Set<string>()
  const matches = value.matchAll(/\{(\w+)\}/g)
  for (const match of matches) {
    const name = match[1]
    if (name !== undefined) names.add(name)
  }
  return names
}

describe('shared i18n exports', () => {
  it('exposes the default locale and supported locales', () => {
    expect(defaultLocale).toBe('en')
    expect(supportedLocales).toEqual(['en', 'pt-BR'])
  })

  it('loads the english locale bundle', async () => {
    const locale = await loadLocale('en')

    expect(locale).toHaveProperty('default')
  })

  it('loads the portuguese locale bundle', async () => {
    const locale = await loadLocale('pt-BR')

    expect(locale).toHaveProperty('default')
  })
})

describe('i18n locale parity', () => {
  const enFlat = flatten(en as JsonValue)
  const ptFlat = flatten(ptBR as JsonValue)

  it('has identical key-path sets across en and pt-BR', () => {
    const enKeys = new Set(enFlat.keys())
    const ptKeys = new Set(ptFlat.keys())

    const missingInPt = [...enKeys].filter((key) => !ptKeys.has(key)).sort()
    const missingInEn = [...ptKeys].filter((key) => !enKeys.has(key)).sort()

    expect(missingInPt).toEqual([])
    expect(missingInEn).toEqual([])
  })

  it('has matching placeholder names per key across en and pt-BR', () => {
    const mismatches: Array<{ key: string; en: string[]; pt: string[] }> = []

    for (const [key, enValue] of enFlat) {
      const ptValue = ptFlat.get(key)
      if (ptValue === undefined) continue
      const enNames = [...placeholderNames(enValue)].sort()
      const ptNames = [...placeholderNames(ptValue)].sort()
      if (enNames.join('|') !== ptNames.join('|')) {
        mismatches.push({ key, en: enNames, pt: ptNames })
      }
    }

    expect(mismatches).toEqual([])
  })

  it('labels every coach-mark tour section in both locales', () => {
    for (const flat of [enFlat, ptFlat]) {
      expect(flat.get('tour.sections.coach-today')).toBeTruthy()
      expect(flat.get('tour.sections.coach-astra')).toBeTruthy()
      expect(flat.get('tour.sections.coach-calendar')).toBeTruthy()
    }
  })
})
