import { describe, expect, it, vi } from 'vitest'
import { canRetryDroppedMutation } from '@/lib/offline-recovery'
import type { PersistedQueuedMutation } from '@orbit/shared/types/sync'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/query-client', () => ({ queryClient: {}, persistQueryCache: vi.fn() }))
vi.mock('@/lib/offline-queue', () => ({}))
vi.mock('@/lib/offline-state', () => ({}))
vi.mock('@/lib/offline-runtime', () => ({}))

const mutation: PersistedQueuedMutation = {
  id: 'lost-tag', type: 'updateTag', timestamp: 1, retries: 3, maxRetries: 3,
  endpoint: '/api/tags/work', method: 'PUT', scope: 'tags',
  targetEntityId: 'work', payload: { name: 'offline-work' },
}

describe('dropped mutation references', () => {
  it.each(['offline-work', 'offline-habit-123-1'])('allows user text %s', (name) => {
    expect(canRetryDroppedMutation({ ...mutation, payload: { name, description: name, items: [{ text: name }] } })).toBe(true)
  })

  it.each([
    { targetEntityId: 'offline-tag-123-1' },
    { dependsOn: ['offline-goal-123-1'] },
    { endpoint: '/api/tags/offline-tag-123-1' },
    { payload: { parentId: 'offline-habit-123-1' } },
    { payload: { tagIds: ['work', 'offline-tag-123-1'] } },
    { payload: { positions: [{ habitId: 'offline-habit-123-1', position: 0 }] } },
    { payload: { items: [{ id: 'offline-habit-123-1' }] } },
  ])('rejects an unresolved reference in %j', (patch) => {
    expect(canRetryDroppedMutation({ ...mutation, payload: null, ...patch })).toBe(false)
  })

  it('allows a creation client id that defines an entity instead of referencing one', () => {
    expect(canRetryDroppedMutation({ ...mutation, type: 'createTag', targetEntityId: null, clientEntityId: 'offline-tag-123-1', payload: { name: 'Work' } })).toBe(true)
  })
})
