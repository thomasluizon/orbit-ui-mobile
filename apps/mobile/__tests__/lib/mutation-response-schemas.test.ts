import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/lib/api-client'
import { getMutationResponseSchema } from '@/lib/mutation-response-schemas'

const { getTokenMock, fetchMock, buildAppVersionHeadersMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  fetchMock: vi.fn(),
  buildAppVersionHeadersMock: vi.fn(() => ({ 'X-App-Version': '1.1.4' })),
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: getTokenMock,
  clearAllTokens: vi.fn(),
}))

vi.mock('@/lib/app-version', () => ({
  buildAppVersionHeaders: buildAppVersionHeadersMock,
}))

vi.mock('@/stores/version-gate-store', () => ({
  markUpgradeRequired: vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  refreshSession: vi.fn(),
  clearSessionAndResetAuth: vi.fn(),
  isAuthTransitionInFlight: vi.fn(() => false),
}))

vi.mock('expo-router', () => ({
  router: { replace: vi.fn() },
}))

vi.stubGlobal('fetch', fetchMock)

function mockJsonResponse(body: unknown): void {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

const validLogHabit = {
  logId: 'log-1',
  isFirstCompletionToday: true,
  currentStreak: 3,
  linkedGoalUpdates: null,
  xpEarned: null,
  newAchievementIds: null,
}

describe('mutation response schema registry', () => {
  beforeEach(() => {
    getTokenMock.mockReset()
    getTokenMock.mockResolvedValue('token-123')
    fetchMock.mockReset()
  })

  it('maps every offline-queue-coupled high-value mutation to a schema', () => {
    for (const type of [
      'logHabit',
      'bulkCreateHabits',
      'bulkDeleteHabits',
      'bulkLogHabits',
      'bulkSkipHabits',
    ] as const) {
      expect(getMutationResponseSchema(type)).toBeDefined()
    }
  })

  it('returns undefined for a mutation type without a registered schema (opt-in)', () => {
    expect(getMutationResponseSchema('updateHabit')).toBeUndefined()
    expect(getMutationResponseSchema('deleteHabit')).toBeUndefined()
    expect(getMutationResponseSchema('reorderHabits')).toBeUndefined()
  })

  it('passes a valid response through the registry schema at the apiClient boundary', async () => {
    mockJsonResponse(validLogHabit)

    await expect(
      apiClient('/api/habits/h-1/log', { method: 'POST' }, getMutationResponseSchema('logHabit')),
    ).resolves.toMatchObject({ logId: 'log-1', currentStreak: 3 })
  })

  it('still passes when the response carries an additive unknown field', async () => {
    mockJsonResponse({ ...validLogHabit, serverAddedLater: { experiment: true } })

    const result = await apiClient(
      '/api/habits/h-1/log',
      { method: 'POST' },
      getMutationResponseSchema('logHabit'),
    )

    expect(result).toMatchObject({ logId: 'log-1' })
    expect(result).not.toHaveProperty('serverAddedLater')
  })

  it('throws the typed 502 boundary error on a contract mismatch', async () => {
    mockJsonResponse({ ...validLogHabit, currentStreak: 'not-a-number' })

    await expect(
      apiClient('/api/habits/h-1/log', { method: 'POST' }, getMutationResponseSchema('logHabit')),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    })
  })

  it('validates the bulk-create result shape returned by the registry', async () => {
    mockJsonResponse({
      results: [
        { index: 0, status: 'Success', habitId: 'h-1', title: 'Read', error: null, field: null },
      ],
    })

    await expect(
      apiClient('/api/habits/bulk', { method: 'POST' }, getMutationResponseSchema('bulkCreateHabits')),
    ).resolves.toMatchObject({ results: [{ index: 0, status: 'Success', habitId: 'h-1' }] })
  })
})
