import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { setApiFetchTranslate } from '@/lib/api-fetch'

const mocks = vi.hoisted(() => ({
  confirmPendingOperation: vi.fn(),
  executePendingOperation: vi.fn(),
  issuePendingOperationStepUp: vi.fn(),
  verifyPendingOperationStepUp: vi.fn(),
  revisePendingOperation: vi.fn(),
  refreshPendingOperation: vi.fn(),
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
  revisePendingOperation: mocks.revisePendingOperation,
  refreshPendingOperation: mocks.refreshPendingOperation,
}))

import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'
import { setAccountEventOrigin } from '@/lib/account-event-origin'

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
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setAccountEventOrigin('chat-connection')
    setApiFetchTranslate((key) => key)
    useAppToastStore.setState({ currentToast: null, queue: [] })
    mocks.confirmPendingOperation.mockReset()
    mocks.executePendingOperation.mockReset()
    mocks.issuePendingOperationStepUp.mockReset()
    mocks.verifyPendingOperationStepUp.mockReset()
    mocks.revisePendingOperation.mockReset()
    mocks.refreshPendingOperation.mockReset()
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

  it('revises without confirming or executing', async () => {
    const response = { isSuccess: true, error: null, pendingOperationId: 'pending-1',
      cancelled: false, preview: { changes: [], changeTargetCount: 1, items: [], previewFingerprint: 'next' } }
    mocks.revisePendingOperation.mockResolvedValue({ ok: true, data: response })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))
    const request = { previewFingerprint: 'current', items: [{ itemId: 'habit-1', edits: { emoji: 'B' } }] }
    let outcome: Awaited<ReturnType<typeof result.current.revisePendingOperationForBubble>> | null = null
    await act(async () => { outcome = await result.current.revisePendingOperationForBubble('pending-1', request) })
    expect(mocks.revisePendingOperation).toHaveBeenCalledWith('pending-1', request, JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' }))
    expect(outcome).toEqual({ ok: true, result: response })
    expect(mocks.confirmPendingOperation).not.toHaveBeenCalled()
    expect(onExecuted).not.toHaveBeenCalled()
  })

  it('refreshes a preview without confirming or executing', async () => {
    const preview = { changes: [], changeTargetCount: 1, items: [], previewFingerprint: 'next' }
    const response = { isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false, preview }
    mocks.refreshPendingOperation.mockResolvedValue({ ok: true, data: response })
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))
    let outcome: Awaited<ReturnType<typeof result.current.refreshPendingOperationForBubble>> | null = null
    await act(async () => { outcome = await result.current.refreshPendingOperationForBubble('pending-1') })
    expect(mocks.refreshPendingOperation).toHaveBeenCalledWith('pending-1', JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' }))
    expect(outcome).toEqual({ ok: true, result: response })
    expect(mocks.confirmPendingOperation).not.toHaveBeenCalled()
    expect(onExecuted).not.toHaveBeenCalled()
  })

  it('keeps account changes separate from stale preview conflicts', async () => {
    mocks.refreshPendingOperation.mockResolvedValue({ ok: false, status: 409, code: 'ACCOUNT_CHANGED',
      error: 'The signed in account changed before this request ran', sessionRefreshFailed: false })
    const { result } = renderHook(() => useChatPendingOperations(vi.fn(async () => {})))
    let outcome: Awaited<ReturnType<typeof result.current.refreshPendingOperationForBubble>> | null = null
    await act(async () => { outcome = await result.current.refreshPendingOperationForBubble('pending-1') })
    expect(outcome).toEqual({ ok: false, error: 'errors.api.accountChanged' })
  })

  it('does not forward an execution that returns after the account changes', async () => {
    let resolveExecution!: (value: { ok: true; data: AgentExecuteOperationResponse }) => void
    mocks.confirmPendingOperation.mockResolvedValue({ ok: true, data: { confirmationToken: 'token-1' } })
    mocks.executePendingOperation.mockReturnValue(new Promise((resolve) => { resolveExecution = resolve }))
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))

    const pending = result.current.confirmAndExecutePendingOperation('pending-1')
    await vi.waitFor(() => expect(mocks.executePendingOperation).toHaveBeenCalledOnce())
    advanceAccountGeneration()
    resolveExecution({ ok: true, data: makeExecution('Created') })

    await expect(pending).resolves.toEqual({ ok: false, error: 'errors.api.accountChanged' })
    expect(onExecuted).not.toHaveBeenCalled()
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

  it('shows reload guidance when confirmation was refused after an account switch', async () => {
    mocks.confirmPendingOperation.mockResolvedValue({
      ok: false,
      error: 'The signed in account changed before this request ran',
      status: 409,
      code: 'ACCOUNT_CHANGED',
      sessionRefreshFailed: false,
    })
    const { result } = renderHook(() => useChatPendingOperations(vi.fn(async () => {})))

    let outcome: Awaited<ReturnType<typeof result.current.confirmAndExecutePendingOperation>> | null = null
    await act(async () => {
      outcome = await result.current.confirmAndExecutePendingOperation('pending-1')
    })

    expect(outcome).toEqual({ ok: false, error: 'errors.api.accountChanged' })
    expect(mocks.executePendingOperation).not.toHaveBeenCalled()
  })

  it('offers the reload prompt when a chat action is no longer recognized', async () => {
    mocks.confirmPendingOperation.mockRejectedValue(new UnrecognizedActionError('Unknown action'))
    const onExecuted = vi.fn(async () => {})
    const { result } = renderHook(() => useChatPendingOperations(onExecuted))
    const onUnexpectedOutcome = vi.fn()

    void result.current.confirmAndExecutePendingOperation('pending-1').then(onUnexpectedOutcome, onUnexpectedOutcome)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useVersionGateStore.getState().reloadReason).toBe('appUpdated')
    expect(useAppToastStore.getState().currentToast).toBeNull()
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

    expect(mocks.verifyPendingOperationStepUp).toHaveBeenCalledWith(
      'pending-2',
      'challenge-2',
      '123456',
      JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' }),
    )
    expect(mocks.executePendingOperation).toHaveBeenCalledWith('pending-2', 'token-2', JSON.stringify({ accountId: null, eventOrigin: 'chat-connection' }))
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
