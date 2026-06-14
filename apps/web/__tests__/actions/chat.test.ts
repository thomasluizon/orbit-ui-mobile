import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerAuthFetch = vi.fn()
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: mockServerAuthFetch,
}))

const {
  confirmPendingOperation,
  issuePendingOperationStepUp,
  verifyPendingOperationStepUp,
  executePendingOperation,
} = await import('@/app/actions/chat')

describe('chat server actions', () => {
  beforeEach(() => {
    mockServerAuthFetch.mockReset()
  })

  describe('pending-operation actions', () => {
    it('confirms a pending operation through the ai endpoint', async () => {
      mockServerAuthFetch.mockResolvedValue({
        pendingOperationId: 'pending-1',
        confirmationToken: 'confirm-token',
        expiresAtUtc: '2025-01-15T10:05:00Z',
      })

      const result = await confirmPendingOperation('pending-1')

      expect(result).toEqual({
        ok: true,
        data: {
          pendingOperationId: 'pending-1',
          confirmationToken: 'confirm-token',
          expiresAtUtc: '2025-01-15T10:05:00Z',
        },
      })
      expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/ai/pending-operations/pending-1/confirm', {
        method: 'POST',
      })
    })

    it('requests a step-up challenge', async () => {
      mockServerAuthFetch.mockResolvedValue({
        challengeId: 'challenge-1',
        pendingOperationId: 'pending-1',
        expiresAtUtc: '2025-01-15T10:05:00Z',
      })

      const result = await issuePendingOperationStepUp('pending-1', 'en')

      expect(result.ok).toBe(true)
      expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/ai/pending-operations/pending-1/step-up', {
        method: 'POST',
        body: JSON.stringify({ language: 'en' }),
      })
    })

    it('verifies a step-up challenge', async () => {
      mockServerAuthFetch.mockResolvedValue({ id: 'challenge-1' })

      const result = await verifyPendingOperationStepUp('pending-1', 'challenge-1', '123456')

      expect(result.ok).toBe(true)
      expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/ai/pending-operations/pending-1/step-up/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      })
    })

    it('forwards the backend error code when a pending-operation call fails', async () => {
      mockServerAuthFetch.mockRejectedValue(
        Object.assign(new Error('Step-up required'), { status: 403, code: 'STEP_UP_REQUIRED' }),
      )

      const result = await confirmPendingOperation('pending-1')

      expect(result).toEqual({
        ok: false,
        error: 'Step-up required',
        status: 403,
        code: 'STEP_UP_REQUIRED',
      })
    })

    it('executes a confirmed pending operation', async () => {
      mockServerAuthFetch.mockResolvedValue({
        operation: {
          operationId: 'habit.delete',
          sourceName: 'Delete habit',
          riskClass: 'Destructive',
          confirmationRequirement: 'FreshConfirmation',
          status: 'Succeeded',
        },
      })

      const result = await executePendingOperation('pending-1', 'confirm-token')

      expect(result.ok).toBe(true)
      expect(mockServerAuthFetch).toHaveBeenCalledWith('/api/ai/pending-operations/pending-1/execute', {
        method: 'POST',
        body: JSON.stringify({ confirmationToken: 'confirm-token' }),
      })
    })
  })
})
