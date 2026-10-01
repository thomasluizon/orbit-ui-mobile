import { describe, expect, it } from 'vitest'
import { buildHabitCreateHref, resolveHabitCreateReturnPath } from '../utils/habit-create-navigation'

describe('habit creation navigation', () => {
  it('opens a blank form without optional parameters', () => {
    expect(buildHabitCreateHref()).toBe('/habits/new')
  })

  it('round trips a conversation origin and form prefills', () => {
    const href = buildHabitCreateHref({ title: 'Walk & read', date: '2026-09-05', from: '/?date=2026-09-05', conversation: true, recoveryId: 'orphan-id' })
    const params = new URL(href, 'https://orbit.test').searchParams
    expect(Object.fromEntries(params)).toEqual({ title: 'Walk & read', date: '2026-09-05', from: '/?date=2026-09-05', origin: 'conversation', recovery: 'orphan-id' })
  })

  it.each(['/', '/calendar', '/search?query=walk', '/?date=2026-09-05#habits'])('keeps the local origin %s', (from) => {
    expect(resolveHabitCreateReturnPath(from)).toBe(from)
  })

  it.each([undefined, '', 'https://outside.test', '//outside.test', '/\\outside.test', '/\n/outside.test', '/habits/new', '/habits/new?from=/search', '/habits/new/'])('rejects an external or recursive origin %s', (from) => {
    expect(resolveHabitCreateReturnPath(from)).toBe('/')
  })

  it.each([
    ['/habits/new//#calendar', '/'],
    ['/habits/new///?from=/search#calendar', '/'],
    ['/calendar#section?from=/habits/new', '/calendar#section?from=/habits/new'],
    ['/habits/newer/', '/habits/newer/'],
    ['/habits/new/child', '/habits/new/child'],
    ['/habits/new%2F', '/habits/new%2F'],
    ['/calendar?from=/habits/new', '/calendar?from=/habits/new'],
    ['/calendar#\u2028section', '/'],
  ])('resolves %s without normalizing the origin', (from, expected) => {
    expect(resolveHabitCreateReturnPath(from)).toBe(expected)
  })

  it.each([
    ['repeated fragment delimiters', `/calendar#${'#'.repeat(100_000)}`, true],
    ['fragment delimiters on a recursive origin', `/habits/new#${'#'.repeat(100_000)}`, false],
    ['internal slashes', `/calendar/${'/'.repeat(50_000)}day`, true],
    ['trailing slashes on a recursive origin', `/habits/new${'/'.repeat(100_000)}`, false],
    ['protocol-relative slashes', '/'.repeat(100_000), false],
  ] as const)('resolves %s within the navigation budget', (_description, from, accepted) => {
    const started = performance.now()
    const result = resolveHabitCreateReturnPath(from)
    const elapsed = performance.now() - started
    expect(result).toBe(accepted ? from : '/')
    expect(elapsed).toBeLessThan(100)
  })
})
