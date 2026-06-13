import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'

const mocks = vi.hoisted(() => ({
  confirmPendingOperation: vi.fn(),
  executePendingOperation: vi.fn(),
  issuePendingOperationStepUp: vi.fn(),
  verifyPendingOperationStepUp: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'pt-BR',
}))

vi.mock('@/app/actions/chat', () => ({
  confirmPendingOperation: mocks.confirmPendingOperation,
  executePendingOperation: mocks.executePendingOperation,
  issuePendingOperationStepUp: mocks.issuePendingOperationStepUp,
  verifyPendingOperationStepUp: mocks.verifyPendingOperationStepUp,
}))

import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'

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

describe('useChatPendingOperations', () => {
  beforeEach(() => {
    mocks.confirmPendingOperation.mockReset()
    mocks.executePendingOperation.mockReset()
    mocks.issuePendingOperationStepUp.mockReset()
    mocks.verifyPendingOperationStepUp.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('confirms then executes and forwards the execution to onExecuted', async () => {
    mocks.confirmPendingOperation.mockResolvedValue({
      ok: true,
      data: { confirmationToken: 'token-1' },
    })
    mocks.executePendingOperation.mockResolvedValue({
      ok: true,
      data: makeExecution('Created'),
    })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    let outcome: Awaited<ReturnType<typeof result.current.confirmAndExecutePendingOperation>> | null = null
    await act(async () => {
      outcome = await result.current.confirmAndExecutePendingOperation('pending-1')
    })

    expect(mocks.confirmPendingOperation).toHaveBeenCalledWith('pending-1')
    expect(mocks.executePendingOperation).toHaveBeenCalledWith('pending-1', 'token-1')
    expect(onExecuted).toHaveBeenCalledWith(makeExecution('Created'))
    expect(outcome).toMatchObject({ ok: true })
  })

  it('stops at confirm failure without executing', async () => {
    mocks.confirmPendingOperation.mockResolvedValue({
      ok: false,
      error: 'nope',
      status: 400,
    })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    let outcome: Awaited<ReturnType<typeof result.current.confirmAndExecutePendingOperation>> | null = null
    await act(async () => {
      outcome = await result.current.confirmAndExecutePendingOperation('pending-1')
    })

    expect(mocks.executePendingOperation).not.toHaveBeenCalled()
    expect(onExecuted).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: false, error: 'chat.sendError' })
  })

  it('prepares a step-up by confirming then issuing a challenge with the active locale', async () => {
    mocks.confirmPendingOperation.mockResolvedValue({
      ok: true,
      data: { confirmationToken: 'token-2' },
    })
    mocks.issuePendingOperationStepUp.mockResolvedValue({
      ok: true,
      data: { challengeId: 'challenge-2' },
    })
    const { result } = renderHook(() => useChatPendingOperations(vi.fn(async () => {})))

    let outcome: Awaited<ReturnType<typeof result.current.prepareStepUpForBubble>> | null = null
    await act(async () => {
      outcome = await result.current.prepareStepUpForBubble('pending-2')
    })

    expect(mocks.issuePendingOperationStepUp).toHaveBeenCalledWith('pending-2', 'pt-BR')
    expect(outcome).toEqual({
      ok: true,
      challengeId: 'challenge-2',
      confirmationToken: 'token-2',
    })
  })

  it('reports the challenge error when issuing a step-up fails', async () => {
    mocks.confirmPendingOperation.mockResolvedValue({
      ok: true,
      data: { confirmationToken: 'token-2' },
    })
    mocks.issuePendingOperationStepUp.mockResolvedValue({
      ok: false,
      error: 'challenge down',
      status: 500,
    })
    const { result } = renderHook(() => useChatPendingOperations(vi.fn(async () => {})))

    let outcome: Awaited<ReturnType<typeof result.current.prepareStepUpForBubble>> | null = null
    await act(async () => {
      outcome = await result.current.prepareStepUpForBubble('pending-2')
    })

    expect(outcome).toMatchObject({ ok: false, error: 'chat.sendError' })
  })

  it('verifies the code then executes, forwarding to onExecuted', async () => {
    mocks.verifyPendingOperationStepUp.mockResolvedValue({ ok: true, data: { id: 'v-1' } })
    mocks.executePendingOperation.mockResolvedValue({
      ok: true,
      data: makeExecution('Done'),
    })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    let outcome: Awaited<ReturnType<typeof result.current.verifyStepUpForBubble>> | null = null
    await act(async () => {
      outcome = await result.current.verifyStepUpForBubble('pending-2', 'challenge-2', '123456', 'token-2')
    })

    expect(mocks.verifyPendingOperationStepUp).toHaveBeenCalledWith('pending-2', 'challenge-2', '123456')
    expect(mocks.executePendingOperation).toHaveBeenCalledWith('pending-2', 'token-2')
    expect(onExecuted).toHaveBeenCalledWith(makeExecution('Done'))
    expect(outcome).toMatchObject({ ok: true })
  })

  it('does not execute when verification fails', async () => {
    mocks.verifyPendingOperationStepUp.mockResolvedValue({
      ok: false,
      error: 'wrong code',
      status: 401,
    })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    let outcome: Awaited<ReturnType<typeof result.current.verifyStepUpForBubble>> | null = null
    await act(async () => {
      outcome = await result.current.verifyStepUpForBubble('pending-2', 'challenge-2', '000000', 'token-2')
    })

    expect(mocks.executePendingOperation).not.toHaveBeenCalled()
    expect(onExecuted).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: false, error: 'chat.sendError' })
  })
})
