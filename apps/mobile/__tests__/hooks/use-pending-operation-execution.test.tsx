import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
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
  } as AgentExecuteOperationResponse
}

async function renderExecution(
  appendExecutionMessage: (response: AgentExecuteOperationResponse) => Promise<void>,
): Promise<{ current: Hook }> {
  const holder: { current: Hook | null } = { current: null }

  function Component() {
    holder.current = usePendingOperationExecution({ appendExecutionMessage })
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
      API.ai.pendingOperationConfirm('pending-9'),
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
        body: JSON.stringify({ confirmationToken: 'token-9' }),
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
