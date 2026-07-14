import { beforeEach, describe, expect, it } from 'vitest'

import {
  consumePendingIdempotencyKey,
  setPendingIdempotencyKey,
} from '@/lib/idempotency-key'

describe('pending idempotency key registry', () => {
  beforeEach(() => {
    setPendingIdempotencyKey(null)
  })

  it('returns null when no key has been set', () => {
    expect(consumePendingIdempotencyKey()).toBeNull()
  })

  it('consumes a set key exactly once and clears it afterward', () => {
    setPendingIdempotencyKey('mutation-1')

    expect(consumePendingIdempotencyKey()).toBe('mutation-1')
    expect(consumePendingIdempotencyKey()).toBeNull()
  })

  it('keeps only the most recently set key', () => {
    setPendingIdempotencyKey('mutation-1')
    setPendingIdempotencyKey('mutation-2')

    expect(consumePendingIdempotencyKey()).toBe('mutation-2')
  })

  it('clears a pending key when set back to null', () => {
    setPendingIdempotencyKey('mutation-1')
    setPendingIdempotencyKey(null)

    expect(consumePendingIdempotencyKey()).toBeNull()
  })
})
