import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientId } from '../utils/client-id'

describe('createClientId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prefixes the identifier so the caller prefix stays separable', () => {
    const id = createClientId('optimistic')
    expect(id.startsWith('optimistic-')).toBe(true)
    expect(id.length).toBeGreaterThan('optimistic-'.length)
  })

  it('uses crypto.randomUUID when the runtime provides one', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    })
    expect(createClientId('editable-habit')).toBe(
      'editable-habit-11111111-1111-4111-8111-111111111111',
    )
  })

  it('falls back to a monotonic sequence when no CSPRNG is available', () => {
    vi.stubGlobal('crypto', {})
    const id = createClientId('optimistic')
    expect(id).toMatch(/^optimistic-[0-9a-z]+-[0-9a-z]+$/)
  })

  it('stays unique within a single millisecond via the sequence counter', () => {
    vi.stubGlobal('crypto', {})
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const ids = Array.from({ length: 5 }, () => createClientId('optimistic'))
    expect(new Set(ids).size).toBe(5)
  })

  it('never collides across many calls with the real generator', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createClientId('key')))
    expect(ids.size).toBe(1000)
  })
})
