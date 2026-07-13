import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CreateChallengeRequest } from '@orbit/shared/types/challenge'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const { createChallenge, joinChallenge, leaveChallenge, setChallengeHabits } = await import(
  '@/app/actions/challenges'
)

const createInput: CreateChallengeRequest = {
  type: 'CoopGoal',
  title: 'Read together',
  periodStartUtc: '2026-07-13T00:00:00Z',
  linkedHabitIds: ['habit-1'],
}

function unauthorized() {
  return Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' })
}

describe('challenge server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  it('creates a challenge through the challenges endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue({ id: 'challenge-1' })

    const result = await createChallenge(createInput)

    expect(result).toEqual({ ok: true, data: { id: 'challenge-1' } })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/challenges', {
      method: 'POST',
      body: JSON.stringify(createInput),
    })
  })

  it('joins a challenge through the join endpoint', async () => {
    mockServerAuthFetch.mockResolvedValue(null)

    const result = await joinChallenge({ code: 'ABC123', linkedHabitIds: ['habit-1'] })

    expect(result).toEqual({ ok: true, data: null })
    expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/challenges/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABC123', linkedHabitIds: ['habit-1'] }),
    })
  })

  it('forwards the backend error code when a call fails', async () => {
    mockServerAuthFetch.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404, code: 'CHALLENGE_NOT_FOUND' }),
    )

    const result = await joinChallenge({ code: 'BAD', linkedHabitIds: [] })

    expect(result).toEqual({ ok: false, status: 404, code: 'CHALLENGE_NOT_FOUND' })
  })

  it('rejects an unauthenticated call with 401 (serverAuthFetch throws before any request)', async () => {
    mockServerAuthFetch.mockRejectedValue(unauthorized())

    await expect(createChallenge(createInput)).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
    })
    await expect(leaveChallenge('challenge-1')).resolves.toMatchObject({ ok: false, status: 401 })
    await expect(
      setChallengeHabits('challenge-1', { habitIds: ['habit-1'] }),
    ).resolves.toMatchObject({ ok: false, status: 401 })
  })
})
