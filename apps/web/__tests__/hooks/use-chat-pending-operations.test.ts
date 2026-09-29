import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'

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
import { setApiFetchTranslate } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { setAccountEventOrigin } from '@/lib/account-event-origin'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

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
    setAccountEventOrigin('chat-connection')
    setApiFetchTranslate((key) => key)
    vi.mocked(toast.error).mockClear()
    mocks.confirmPendingOperation.mockReset()
    mocks.executePendingOperation.mockReset()
    mocks.issuePendingOperationStepUp.mockReset()
    mocks.verifyPendingOperationStepUp.mockReset()
  })

  afterEach(() => {
    setAccountEventOrigin(null)
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

    const intent = JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' })
    expect(mocks.confirmPendingOperation).toHaveBeenCalledWith('pending-1', intent)
    expect(mocks.executePendingOperation).toHaveBeenCalledWith('pending-1', 'token-1', intent)
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

  it('offers the reload prompt when a chat action is no longer recognized', async () => {
    mocks.confirmPendingOperation.mockRejectedValue(new UnrecognizedActionError('Unknown action'))
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))
    const onUnexpectedOutcome = vi.fn()

    void result.current.confirmAndExecutePendingOperation('pending-1').then(onUnexpectedOutcome, onUnexpectedOutcome)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(toast.error).toHaveBeenCalledWith('errors.api.appUpdated', expect.objectContaining({
      id: 'app-updated',
      duration: Infinity,
      action: expect.objectContaining({ label: 'errors.api.reload', onClick: expect.any(Function) }),
    }))
    expect(mocks.executePendingOperation).not.toHaveBeenCalled()
    expect(onExecuted).not.toHaveBeenCalled()
    expect(onUnexpectedOutcome).not.toHaveBeenCalled()
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

    expect(mocks.issuePendingOperationStepUp).toHaveBeenCalledWith('pending-2', 'pt-BR', JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' }))
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

    const intent = JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' })
    expect(mocks.verifyPendingOperationStepUp).toHaveBeenCalledWith('pending-2', 'challenge-2', '123456', intent)
    expect(mocks.executePendingOperation).toHaveBeenCalledWith('pending-2', 'token-2', intent)
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

  it.each([
    ['confirm', 'confirmAndExecutePendingOperation'],
    ['execute', 'confirmAndExecutePendingOperation'],
    ['challenge', 'prepareStepUpForBubble'],
    ['verify', 'verifyStepUpForBubble'],
  ])('stops and reports a %s account refusal', async (stage, flow) => {
    const refusal = { ok: false, error: 'Account changed', status: 409, code: 'ACCOUNT_CHANGED', sessionRefreshFailed: false }
    mocks.confirmPendingOperation.mockResolvedValue(stage === 'confirm' ? refusal : { ok: true, data: { confirmationToken: 'token' } })
    mocks.executePendingOperation.mockResolvedValue(refusal)
    mocks.issuePendingOperationStepUp.mockResolvedValue(refusal)
    mocks.verifyPendingOperationStepUp.mockResolvedValue(refusal)
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    await act(async () => {
      const action = flow === 'confirmAndExecutePendingOperation'
        ? result.current.confirmAndExecutePendingOperation('pending-1')
        : flow === 'prepareStepUpForBubble'
          ? result.current.prepareStepUpForBubble('pending-1')
          : result.current.verifyStepUpForBubble('pending-1', 'challenge', '123456', 'token')
      const outcome = await action
      expect(outcome).toMatchObject({ ok: false, error: 'errors.api.accountChanged' })
    })
    expect(onExecuted).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})
