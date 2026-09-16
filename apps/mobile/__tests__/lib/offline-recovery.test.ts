import { describe, expect, it, vi } from 'vitest'
import type { PersistedQueuedMutation } from '@orbit/shared/types/sync'
import {
  canRetryDroppedMutation,
  getDroppedItemName,
  getRecoveryDate,
  getRecoveryMessage,
  needsHabitCreation,
} from '@/lib/offline-recovery'

vi.mock('@/lib/offline-mutations', () => ({
  getMutationScope: (type: string) => type === 'retiredMutation' ? undefined : 'habits',
  isAutomaticReplayBlocked: (type: string) =>
    type === 'bulkLogHabits' || type === 'bulkSkipHabits',
  hasPendingOfflineDependencies: (queuedMutation: PersistedQueuedMutation) =>
    Boolean(queuedMutation.targetEntityId?.startsWith('offline-')) ||
    queuedMutation.endpoint.includes('offline-'),
}))

function mutation(
  patch: Partial<PersistedQueuedMutation> = {},
): PersistedQueuedMutation {
  return {
    id: 'mutation-1',
    timestamp: 1,
    type: 'updateHabit',
    endpoint: '/api/habits/habit-1',
    method: 'PUT',
    payload: {},
    retries: 3,
    maxRetries: 5,
    scope: 'habits',
    ...patch,
  }
}

const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key

describe('offline recovery', () => {
  it('reads recovery dates from the payload, dedupe key, or neither', () => {
    expect(getRecoveryDate(mutation({ payload: { date: '2026-09-14' } }))).toBe('2026-09-14')
    expect(getRecoveryDate(mutation({ dedupeKey: 'habit-1-2026-09-13' }))).toBe('2026-09-13')
    expect(getRecoveryDate(mutation({ payload: { date: 14 }, dedupeKey: null }))).toBeNull()
  })

  it('identifies every dropped mutation that needs habit creation', () => {
    expect(needsHabitCreation(mutation({ type: 'createHabit' }))).toBe(true)
    expect(needsHabitCreation(mutation({ targetEntityId: 'offline-habit-1' }))).toBe(true)
    expect(needsHabitCreation(mutation({
      type: 'logHabit',
      endpoint: '/api/habits/offline-habit-1/logs',
    }))).toBe(true)
    expect(needsHabitCreation(mutation())).toBe(false)
  })

  it('allows only known, dependency-free, individually safe retries', () => {
    expect(canRetryDroppedMutation(mutation())).toBe(true)
    expect(canRetryDroppedMutation(mutation({ type: 'bulkLogHabits' }))).toBe(false)
    expect(canRetryDroppedMutation(mutation({ targetEntityId: 'offline-habit-1' }))).toBe(false)
    expect(canRetryDroppedMutation(mutation({ type: 'retiredMutation' }))).toBe(false)
  })

  it('finds item names without inventing one', () => {
    expect(getDroppedItemName(mutation({ payload: { title: 'Read' } }))).toBe('Read')
    expect(getDroppedItemName(mutation({ payload: { name: 'Focus' } }))).toBe('Focus')
    expect(getDroppedItemName(mutation({ payload: 'Read' }))).toBeNull()
  })

  it('explains orphaned logs, missing habits, logs, and general changes', () => {
    expect(getRecoveryMessage(mutation({
      type: 'logHabit',
      endpoint: '/api/habits/offline-habit-1/logs',
      payload: { date: '2026-09-14' },
    }), 'Read', translate)).toBe('common.syncOrphaned:{"date":"2026-09-14"}')
    expect(getRecoveryMessage(mutation({
      type: 'createHabit',
      payload: { title: 'Read' },
    }), 'Read', translate)).toBe('common.syncHabitNotCreated:{"item":"Read"}')
    expect(getRecoveryMessage(mutation({ type: 'logHabit' }), 'Read', translate))
      .toBe('common.syncDropped:{"item":"Read"}')
    expect(getRecoveryMessage(mutation(), 'Read', translate))
      .toBe('common.syncChangeDropped:{"item":"Read"}')
  })
})
