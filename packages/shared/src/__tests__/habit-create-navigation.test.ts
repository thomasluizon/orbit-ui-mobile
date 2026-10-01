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
})
