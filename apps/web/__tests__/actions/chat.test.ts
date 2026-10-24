import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerAuthMutate = vi.fn()
const mockServerAuthFetch = vi.fn()
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR' }))
vi.mock('@/lib/server-fetch', () => ({
  serverAuthMutate: mockServerAuthMutate,
  serverAuthFetch: mockServerAuthFetch,
}))

const {
  getCurrentProactiveItem,
  confirmPendingOperation,
  issuePendingOperationStepUp,
  verifyPendingOperationStepUp,
  executePendingOperation,
} = await import('@/app/actions/chat')

describe('chat server actions', () => {
  beforeEach(() => {
    mockServerAuthMutate.mockReset()
  })

  it('negotiates proactive parts using the shared chat capabilities', async () => {
    await getCurrentProactiveItem()
    const [path] = mockServerAuthFetch.mock.calls[0]!
    const url = new URL(path, 'https://example.test')
    expect(url.pathname).toBe('/api/ai/proactive/current')
    expect(JSON.parse(url.searchParams.get('clientContext')!)).toMatchObject({
      platform: 'web', locale: 'pt-BR', supportsParts: true,
      partKinds: expect.arrayContaining(['habitList', 'goalList', 'calendar', 'daySummary', 'periodInsight']),
      supportsDatedHabitListCard: true,
    })
  })

  describe('pending-operation actions', () => {
    it('confirms a pending operation through the ai endpoint', async () => {
      mockServerAuthMutate.mockResolvedValue({
        pendingOperationId: 'pending-1',
        confirmationToken: 'confirm-token',
        expiresAtUtc: '2025-01-15T10:05:00Z',
      })

      const result = await confirmPendingOperation('pending-1', null)

      expect(result).toEqual({
        ok: true,
        data: {
          pendingOperationId: 'pending-1',
          confirmationToken: 'confirm-token',
          expiresAtUtc: '2025-01-15T10:05:00Z',
        },
      })
      expect(mockServerAuthMutate).toHaveBeenCalledWith(
        '/api/ai/pending-operations/pending-1/confirm',
        { method: 'POST' },
        null,
      )
    })

    it('requests a step-up challenge', async () => {
      mockServerAuthMutate.mockResolvedValue({
        challengeId: 'challenge-1',
        pendingOperationId: 'pending-1',
        expiresAtUtc: '2025-01-15T10:05:00Z',
      })

      const result = await issuePendingOperationStepUp('pending-1', 'en', null)

      expect(result.ok).toBe(true)
      expect(mockServerAuthMutate).toHaveBeenCalledWith(
        '/api/ai/pending-operations/pending-1/step-up',
        { method: 'POST', body: JSON.stringify({ language: 'en' }) },
        null,
      )
    })

    it('verifies a step-up challenge', async () => {
      mockServerAuthMutate.mockResolvedValue({ id: 'challenge-1' })

      const result = await verifyPendingOperationStepUp('pending-1', 'challenge-1', '123456', null)

      expect(result.ok).toBe(true)
      expect(mockServerAuthMutate).toHaveBeenCalledWith(
        '/api/ai/pending-operations/pending-1/step-up/verify',
        { method: 'POST', body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }) },
        null,
      )
    })

    it('forwards the backend error code when a pending-operation call fails', async () => {
      mockServerAuthMutate.mockRejectedValue(
        Object.assign(new Error('Step-up required'), { status: 403, code: 'STEP_UP_REQUIRED' }),
      )

      const result = await confirmPendingOperation('pending-1', null)

      expect(result).toEqual({
        ok: false,
        error: 'Step-up required',
        status: 403,
        code: 'STEP_UP_REQUIRED',
        sessionRefreshFailed: false,
      })
    })

    it('rejects an unauthenticated call with 401 (serverAuthMutate throws before any request)', async () => {
      mockServerAuthMutate.mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' }),
      )

      await expect(confirmPendingOperation('pending-1', null)).resolves.toMatchObject({
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
      })
      await expect(executePendingOperation('pending-1', 'confirm-token', null)).resolves.toMatchObject({
        ok: false,
        status: 401,
      })
    })

    it('executes a confirmed pending operation', async () => {
      mockServerAuthMutate.mockResolvedValue({
        operation: {
          operationId: 'habit.delete',
          sourceName: 'Delete habit',
          riskClass: 'Destructive',
          confirmationRequirement: 'FreshConfirmation',
          status: 'Succeeded',
        },
      })

      const result = await executePendingOperation('pending-1', 'confirm-token', null)

      expect(result.ok).toBe(true)
      expect(mockServerAuthMutate).toHaveBeenCalledWith(
        '/api/ai/pending-operations/pending-1/execute',
        { method: 'POST', body: JSON.stringify({ confirmationToken: 'confirm-token' }) },
        null,
      )
    })
  })
})
