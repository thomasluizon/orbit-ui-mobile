import { describe, expect, it } from 'vitest'
import { plural } from '../utils/plural'

describe('plural', () => {
  it('returns text without a pipe separator unchanged', () => {
    expect(plural('Há 5 minutos', 5)).toBe('Há 5 minutos')
  })

  it('picks singular or plural from two forms', () => {
    expect(plural('Há 1 minuto | Há 1 minutos', 1)).toBe('Há 1 minuto')
    expect(plural('Há 5 minuto | Há 5 minutos', 5)).toBe('Há 5 minutos')
  })

  it('picks zero, singular, or plural from three forms', () => {
    expect(plural('none | one | many', 0)).toBe('none')
    expect(plural('none | one | many', 1)).toBe('one')
    expect(plural('none | one | many', 7)).toBe('many')
  })
})
