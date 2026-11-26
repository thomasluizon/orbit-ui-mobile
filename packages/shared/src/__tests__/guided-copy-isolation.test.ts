import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

type Words = Record<string, unknown>

function read(words: Words, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Words | undefined)?.[part], words)
}

const BASE_COPY: ReadonlyArray<{ key: string; guidedKey: string; en: string; ptBR: string }> = [
  { key: 'todayOrbit.offline', guidedKey: 'todayOrbit.guided.offline', en: 'Orbit needs a connection. Habit logging still works offline.', ptBR: 'O Orbit precisa de conexão. Você ainda pode registrar hábitos offline.' },
  { key: 'todayOrbit.offlineLog', guidedKey: 'todayOrbit.guided.offlineLog', en: 'Saved on this device. Orbit will sync it when you reconnect.', ptBR: 'Salvo neste aparelho. O Orbit sincroniza quando você se reconectar.' },
  { key: 'habits.detail.loadError', guidedKey: 'habits.detail.orbit.loadError', en: 'We could not load this habit.', ptBR: 'Não foi possível carregar este hábito.' },
]

describe('guided copy stays apart from the base copy', () => {
  it.each(BASE_COPY)('keeps the main text of $key and gives the guided flows $guidedKey', (row) => {
    expect(read(en, row.key)).toBe(row.en)
    expect(read(ptBR, row.key)).toBe(row.ptBR)
    expect(typeof read(en, row.guidedKey)).toBe('string')
    expect(typeof read(ptBR, row.guidedKey)).toBe('string')
    expect([read(en, row.guidedKey), read(ptBR, row.guidedKey)]).not.toEqual([row.en, row.ptBR])
  })

  it('keeps the count of days sentence of a gap on main while the guided flows are off', () => {
    expect(read(en, 'todayOrbit.returningElapsed')).toContain('{days, plural')
    expect(read(ptBR, 'todayOrbit.returningElapsed')).toContain('{days, plural')
    expect(read(en, 'habits.detail.slippingLine')).toContain('{streak}')
    expect(read(ptBR, 'habits.detail.slippingLine')).toContain('{streak}')
  })
})
