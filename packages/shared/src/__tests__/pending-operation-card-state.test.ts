import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  getPendingOperationExecutionStatus,
  usePendingOperationCardState,
  usePendingOperationStepUpVerification,
  type PendingOperationExecutionResult,
  type PendingOperationStepUpPreparationResult,
} from '../hooks/pending-operation-card-state'
import type { AgentExecuteOperationResponse } from '../types/ai'

type CardState = ReturnType<typeof usePendingOperationCardState>
type VerificationState = ReturnType<typeof usePendingOperationStepUpVerification>

const succeededResponse = {
  operation: {
    operationId: 'operation-1',
    sourceName: 'DeleteHabit',
    riskClass: 'High',
    confirmationRequirement: 'StepUp',
    status: 'Succeeded',
  },
} satisfies AgentExecuteOperationResponse

const failedResponse = {
  operation: {
    ...succeededResponse.operation,
    status: 'Failed',
  },
} satisfies AgentExecuteOperationResponse

async function renderCardState(
  onConfirmExecute: (id: string) => Promise<PendingOperationExecutionResult>,
  onPrepareStepUp: (id: string) => Promise<PendingOperationStepUpPreparationResult>,
): Promise<{ current: () => CardState; renderer: ReactTestRenderer }> {
  let current: CardState | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    current = usePendingOperationCardState({
      pendingOperationId: 'pending-1',
      onConfirmExecute,
      onPrepareStepUp,
    })
    return null
  }

  await act(async () => {
    renderer = create(React.createElement(Harness))
  })

  return {
    current: () => {
      if (!current) throw new Error('Expected pending operation state to initialize')
      return current
    },
    renderer: renderer as ReactTestRenderer,
  }
}

async function renderVerificationState(
  onVerify: Parameters<typeof usePendingOperationStepUpVerification>[0]['onVerify'],
  onCompleted: Parameters<typeof usePendingOperationStepUpVerification>[0]['onCompleted'],
): Promise<{ current: () => VerificationState; renderer: ReactTestRenderer }> {
  let current: VerificationState | undefined
  let renderer: ReactTestRenderer | undefined

  function Harness() {
    current = usePendingOperationStepUpVerification({
      genericError: 'Try again',
      onCompleted,
      onVerify,
      pendingOperationId: 'pending-1',
      prepared: {
        challengeId: 'challenge-1',
        confirmationToken: 'confirmation-1',
      },
    })
    return null
  }

  await act(async () => {
    renderer = create(React.createElement(Harness))
  })

  return {
    current: () => {
      if (!current) throw new Error('Expected verification state to initialize')
      return current
    },
    renderer: renderer as ReactTestRenderer,
  }
}

describe('pending operation execution status', () => {
  it('accepts only a successful response with a succeeded operation', () => {
    expect(getPendingOperationExecutionStatus({ ok: true, response: succeededResponse })).toBe(
      'done',
    )
    expect(getPendingOperationExecutionStatus({ ok: true, response: failedResponse })).toBe(
      'failed',
    )
    expect(getPendingOperationExecutionStatus({ ok: false, response: succeededResponse })).toBe(
      'failed',
    )
    expect(getPendingOperationExecutionStatus({ ok: true })).toBe('failed')
  })
})

describe('pending operation card state', () => {
  it('executes the requested operation and exposes its terminal state', async () => {
    const onConfirmExecute = vi.fn().mockResolvedValue({
      ok: true,
      response: succeededResponse,
    })
    const state = await renderCardState(onConfirmExecute, vi.fn())

    await act(() => state.current().execute())

    expect(onConfirmExecute).toHaveBeenCalledWith('pending-1')
    expect(state.current()).toMatchObject({ busy: false, status: 'done' })
    state.renderer.unmount()
  })

  it('restores the resting state when execution rejects', async () => {
    const state = await renderCardState(
      vi.fn().mockRejectedValue(new Error('network failed')),
      vi.fn(),
    )

    await expect(act(() => state.current().execute())).rejects.toThrow('network failed')

    expect(state.current().busy).toBe(false)
    state.renderer.unmount()
  })

  it('prepares, closes, completes, and dismisses a step up operation', async () => {
    const onPrepareStepUp = vi.fn().mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    const state = await renderCardState(vi.fn(), onPrepareStepUp)

    await act(() => state.current().startStepUp())
    expect(onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    expect(state.current().preparedStepUp).toEqual({
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })

    act(() => state.current().closeStepUp())
    act(() => state.current().setConfirmOpen(true))
    act(() => state.current().dismiss())
    expect(state.current()).toMatchObject({
      confirmOpen: true,
      dismissed: true,
      preparedStepUp: undefined,
    })

    act(() => state.current().completeStepUp('done'))
    expect(state.current()).toMatchObject({ preparedStepUp: undefined, status: 'done' })
    state.renderer.unmount()
  })

  it('marks failed preparation and restores busy after preparation rejects', async () => {
    const failedState = await renderCardState(
      vi.fn(),
      vi.fn().mockResolvedValue({ ok: false, error: 'Denied' }),
    )
    await act(() => failedState.current().startStepUp())
    expect(failedState.current()).toMatchObject({ busy: false, status: 'failed' })
    failedState.renderer.unmount()

    const rejectedState = await renderCardState(
      vi.fn(),
      vi.fn().mockRejectedValue(new Error('network failed')),
    )
    await expect(act(() => rejectedState.current().startStepUp())).rejects.toThrow(
      'network failed',
    )
    expect(rejectedState.current().busy).toBe(false)
    rejectedState.renderer.unmount()
  })
})

describe('pending operation step up verification', () => {
  it('submits the current code and completes a successful operation', async () => {
    const onVerify = vi.fn().mockResolvedValue({ ok: true, response: succeededResponse })
    const onCompleted = vi.fn()
    const state = await renderVerificationState(onVerify, onCompleted)

    act(() => state.current().setCode('123456'))
    await act(() => state.current().verify())

    expect(onVerify).toHaveBeenCalledWith(
      'pending-1',
      'challenge-1',
      '123456',
      'confirmation-1',
    )
    expect(onCompleted).toHaveBeenCalledWith('done')
    expect(state.current()).toMatchObject({ error: undefined, verifying: false })
    state.renderer.unmount()
  })

  it('shows the returned error or the generic error without completing', async () => {
    const explicitErrorState = await renderVerificationState(
      vi.fn().mockResolvedValue({ ok: false, error: 'Wrong code' }),
      vi.fn(),
    )
    await act(() => explicitErrorState.current().verify())
    expect(explicitErrorState.current().error).toBe('Wrong code')
    explicitErrorState.renderer.unmount()

    const genericErrorState = await renderVerificationState(
      vi.fn().mockResolvedValue({ ok: false }),
      vi.fn(),
    )
    await act(() => genericErrorState.current().verify())
    expect(genericErrorState.current().error).toBe('Try again')
    genericErrorState.renderer.unmount()
  })

  it('restores the resting state when verification rejects', async () => {
    const state = await renderVerificationState(
      vi.fn().mockRejectedValue(new Error('network failed')),
      vi.fn(),
    )

    await expect(act(() => state.current().verify())).rejects.toThrow('network failed')

    expect(state.current().verifying).toBe(false)
    state.renderer.unmount()
  })
})
