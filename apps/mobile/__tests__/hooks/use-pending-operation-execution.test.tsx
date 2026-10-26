import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { buildChatClientContext } from '@orbit/shared/chat'
import { ApiClientError } from '@orbit/shared/utils'

const clientContext = buildChatClientContext({ platform: 'mobile', locale: 'pt-BR' })
const query = new URLSearchParams({ clientContext: JSON.stringify(clientContext) }).toString()
import type { AgentExecuteOperationResponse } from '@orbit/shared/types'

import { usePendingOperationExecution } from '@/hooks/use-pending-operation-execution'

const TestRenderer = require('react-test-renderer')
const React = require('react')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'pt-BR' },
  }),
}))

type Hook = ReturnType<typeof usePendingOperationExecution>

function makeExecution(summary: string): AgentExecuteOperationResponse {
  return {
    operation: {
      operationId: 'op-1',
      sourceName: 'CreateHabit',
      riskClass: 'Low',
      confirmationRequirement: 'None',
      status: 'Succeeded',
      summary,
    },
  }
}

async function renderExecution(
  handleExecutedOperation: (response: AgentExecuteOperationResponse) => Promise<void>,
): Promise<{ current: Hook }> {
  const holder: { current: Hook | null } = { current: null }

  function Component() {
    holder.current = usePendingOperationExecution({ handleExecutedOperation })
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Component))
    await Promise.resolve()
  })

  if (!holder.current) throw new Error('hook did not render')
  return holder as { current: Hook }
}

describe('usePendingOperationExecution step-up flow', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
  })

  it.each([404, 409])('treats a %s placement revision or refresh as stale', async (status) => {
    mocks.apiClient.mockRejectedValue(new ApiClientError(status, 'pending_operation_not_found'))
    const hook = await renderExecution(vi.fn())
    const request = { previewFingerprint: 'current', items: [{ itemId: '0', placement: 'new_parent' as const }] }
    await TestRenderer.act(async () => {
      await expect(hook.current.revisePendingOperationForBubble('pending-1', request)).resolves.toMatchObject({ ok: false, stale: true })
    })
    await TestRenderer.act(async () => {
      await expect(hook.current.refreshPendingOperationForBubble('pending-1')).resolves.toMatchObject({ ok: false, stale: true })
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
  })

  it('keeps an offline placement revision retryable', async () => {
    mocks.apiClient.mockRejectedValue(new Error('Offline'))
    const hook = await renderExecution(vi.fn())
    await TestRenderer.act(async () => {
      await expect(hook.current.revisePendingOperationForBubble('pending-1', {
        previewFingerprint: 'current', items: [{ itemId: '0', placement: 'new_parent' }],
      })).resolves.toMatchObject({ ok: false, stale: false })
    })
  })

  it('posts a revision without confirming or executing', async () => {
    const response = { isSuccess: true, error: null, pendingOperationId: 'pending-1',
      cancelled: false, preview: { changes: [], changeTargetCount: 1, items: [], previewFingerprint: 'next' } }
    mocks.apiClient.mockResolvedValue(response)
    const appendExecutionMessage = vi.fn(async () => {})
    const hook = await renderExecution(appendExecutionMessage)
    const request = { previewFingerprint: 'current', items: [{ itemId: 'habit-1', edits: { emoji: 'B' } }] }
    const result = await hook.current.revisePendingOperationForBubble('pending-1', request)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.ai.pendingOperationRevise('pending-1'), {
      method: 'POST', body: JSON.stringify({ ...request, clientContext }),
    })
    expect(result).toEqual({ ok: true, result: response })
    expect(mocks.apiClient).toHaveBeenCalledOnce()
    expect(appendExecutionMessage).not.toHaveBeenCalled()
  })

  it('refreshes a preview without confirming or executing', async () => {
    const response = { isSuccess: true, error: null, pendingOperationId: 'pending-1',
      cancelled: false, preview: { changes: [], changeTargetCount: 1, items: [], previewFingerprint: 'next' } }
    mocks.apiClient.mockResolvedValue(response)
    const appendExecutionMessage = vi.fn(async () => {})
    const hook = await renderExecution(appendExecutionMessage)
    const result = await hook.current.refreshPendingOperationForBubble('pending-1')
    expect(mocks.apiClient).toHaveBeenCalledWith(`${API.ai.pendingOperationRefresh('pending-1')}?${query}`, { method: 'POST' })
    expect(mocks.apiClient).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, result: response })
    expect(appendExecutionMessage).not.toHaveBeenCalled()
  })

  it('confirms then issues a step-up challenge, surfacing the device language', async () => {
    mocks.apiClient
      .mockResolvedValueOnce({ confirmationToken: 'token-9' })
      .mockResolvedValueOnce({ challengeId: 'challenge-9', deliveryTarget: 'a@b.test' })
    const appendExecutionMessage = vi.fn(async () => {})
    const hook = await renderExecution(appendExecutionMessage)

    let result: Awaited<ReturnType<Hook['prepareStepUpForBubble']>> | null = null
    await TestRenderer.act(async () => {
      result = await hook.current.prepareStepUpForBubble('pending-9')
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      1,
      `${API.ai.pendingOperationConfirm('pending-9')}?${query}`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      2,
      API.ai.pendingOperationStepUp('pending-9'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ language: 'pt-BR' }),
      }),
    )
    expect(result).toEqual({
      ok: true,
      challengeId: 'challenge-9',
      confirmationToken: 'token-9',
    })
  })

  it('returns an error from prepare when the confirm call fails', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('confirm boom'))
    const hook = await renderExecution(vi.fn(async () => {}))

    let result: Awaited<ReturnType<Hook['prepareStepUpForBubble']>> | null = null
    await TestRenderer.act(async () => {
      result = await hook.current.prepareStepUpForBubble('pending-9')
    })

    expect(result).toMatchObject({ ok: false })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('verifies the code then executes, appending the resulting agent message', async () => {
    mocks.apiClient
      .mockResolvedValueOnce({ id: 'verification-1' })
      .mockResolvedValueOnce(makeExecution('Habit created'))
    const appendExecutionMessage = vi.fn(async () => {})
    const hook = await renderExecution(appendExecutionMessage)

    let result: Awaited<ReturnType<Hook['verifyStepUpForBubble']>> | null = null
    await TestRenderer.act(async () => {
      result = await hook.current.verifyStepUpForBubble(
        'pending-9',
        'challenge-9',
        '123456',
        'token-9',
      )
    })

    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      1,
      API.ai.pendingOperationVerifyStepUp('pending-9'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge-9', code: '123456' }),
      }),
    )
    expect(mocks.apiClient).toHaveBeenNthCalledWith(
      2,
      API.ai.pendingOperationExecute('pending-9'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirmationToken: 'token-9', clientContext }),
      }),
    )
    expect(appendExecutionMessage).toHaveBeenCalledWith(makeExecution('Habit created'))
    expect(result).toMatchObject({ ok: true })
  })

  it('does not execute when verification fails', async () => {
    mocks.apiClient.mockRejectedValueOnce(new Error('bad code'))
    const appendExecutionMessage = vi.fn(async () => {})
    const hook = await renderExecution(appendExecutionMessage)

    let result: Awaited<ReturnType<Hook['verifyStepUpForBubble']>> | null = null
    await TestRenderer.act(async () => {
      result = await hook.current.verifyStepUpForBubble(
        'pending-9',
        'challenge-9',
        '000000',
        'token-9',
      )
    })

    expect(result).toMatchObject({ ok: false })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(appendExecutionMessage).not.toHaveBeenCalled()
  })
})
