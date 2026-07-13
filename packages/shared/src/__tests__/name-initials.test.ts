import { describe, expect, it } from 'vitest'
import { initialsOf } from '../utils/name-initials'

describe('initialsOf', () => {
  it('returns ? for a blank or whitespace-only name', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })

  it('returns up to the first two letters for a single word', () => {
    expect(initialsOf('astra')).toBe('AS')
    expect(initialsOf('a')).toBe('A')
  })

  it('combines the first letters of the first and last words', () => {
    expect(initialsOf('Thomas Gregorio')).toBe('TG')
    expect(initialsOf('  john  ronald  reuel  tolkien ')).toBe('JT')
  })
})
