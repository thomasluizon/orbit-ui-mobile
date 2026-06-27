import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  buildBulkItemsFromPack,
  getTemplatePackById,
  TEMPLATE_PACKS,
  templatePackDescriptionKey,
  templatePackHabitTitleKey,
  templatePackNameKey,
  templatePackTagKey,
} from '../utils/template-packs'

type LocaleSource = Record<string, unknown>

function resolveKey(source: LocaleSource, key: string): unknown {
  return key.split('.').reduce<unknown>((accumulator, part) => {
    if (
      accumulator !== null &&
      typeof accumulator === 'object' &&
      part in (accumulator as LocaleSource)
    ) {
      return (accumulator as LocaleSource)[part]
    }
    return undefined
  }, source)
}

const locales: ReadonlyArray<readonly [string, LocaleSource]> = [
  ['en', en as LocaleSource],
  ['pt-BR', ptBR as LocaleSource],
]

describe('template packs', () => {
  it('exposes four packs with 4-6 habits each', () => {
    expect(TEMPLATE_PACKS).toHaveLength(4)
    expect(TEMPLATE_PACKS.map((pack) => pack.id)).toEqual([
      'morningRoutine',
      'fitnessMovement',
      'studyFocus',
      'mindfulnessWellbeing',
    ])
    for (const pack of TEMPLATE_PACKS) {
      expect(pack.habits.length).toBeGreaterThanOrEqual(4)
      expect(pack.habits.length).toBeLessThanOrEqual(6)
    }
  })

  it('uses unique habit keys within each pack', () => {
    for (const pack of TEMPLATE_PACKS) {
      const keys = pack.habits.map((habit) => habit.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('resolves every pack name, description, habit title, and tag in both locales', () => {
    for (const [localeName, source] of locales) {
      for (const pack of TEMPLATE_PACKS) {
        expect(
          resolveKey(source, templatePackNameKey(pack.id)),
          `${localeName} ${pack.id} name`,
        ).toBeTypeOf('string')
        expect(
          resolveKey(source, templatePackDescriptionKey(pack.id)),
          `${localeName} ${pack.id} description`,
        ).toBeTypeOf('string')
        for (const habit of pack.habits) {
          expect(
            resolveKey(source, templatePackHabitTitleKey(pack.id, habit.key)),
            `${localeName} ${pack.id}.${habit.key}`,
          ).toBeTypeOf('string')
          for (const slug of habit.tags) {
            expect(
              resolveKey(source, templatePackTagKey(slug)),
              `${localeName} tag ${slug}`,
            ).toBeTypeOf('string')
          }
        }
      }
    }
  })

  it('builds bulk items, dropping disabled habits and localizing title + tags', () => {
    const pack = getTemplatePackById('morningRoutine')
    expect(pack).toBeDefined()
    if (!pack) return

    const translate = (key: string) => `t:${key}`
    const items = buildBulkItemsFromPack(pack, new Set(['makeBed', 'water']), translate)

    expect(items).toHaveLength(pack.habits.length - 2)
    expect(items.every((item) => item.isGeneral === false)).toBe(true)

    const stretch = items.find(
      (item) => item.title === `t:${templatePackHabitTitleKey('morningRoutine', 'stretch')}`,
    )
    expect(stretch).toBeDefined()
    expect(stretch?.emoji).toBe('🧘')
    expect(stretch?.frequencyUnit).toBe('Day')
    expect(stretch?.frequencyQuantity).toBe(1)
    expect(stretch?.tags).toEqual([
      `t:${templatePackTagKey('morning')}`,
      `t:${templatePackTagKey('movement')}`,
    ])
  })

  it('returns undefined for an unknown pack id', () => {
    expect(getTemplatePackById('nope')).toBeUndefined()
  })
})
