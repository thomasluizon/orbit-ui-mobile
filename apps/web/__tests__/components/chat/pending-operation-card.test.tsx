import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AgentExecuteOperationResponse, PendingAgentOperation } from '@orbit/shared/types/ai'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { PendingOperationCard } from '@/components/chat/pending-operation-card'

function makePendingOperation(
  overrides: Partial<PendingAgentOperation> = {},
): PendingAgentOperation {
  return {
    id: 'pending-1',
    capabilityId: 'habit.delete',
    displayName: 'Delete habit',
    summary: 'Delete Meditation habit',
    riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation',
    expiresAtUtc: '2025-01-15T10:00:00Z',
    ...overrides,
  }
}

function makeExecutionResponse(
  status: AgentExecuteOperationResponse['operation']['status'],
  overrides: Partial<AgentExecuteOperationResponse> = {},
): AgentExecuteOperationResponse {
  return {
    operation: {
      operationId: 'habit.delete',
      sourceName: 'Delete habit',
      riskClass: 'Destructive',
      confirmationRequirement: 'FreshConfirmation',
      status,
      summary: 'Delete Meditation habit',
      policyReason: status === 'Succeeded' ? null : 'missing_scope:delete_habits',
      payload: null,
    },
    ...overrides,
  }
}

describe('PendingOperationCard', () => {
  it('shows an error instead of success when execution returns a denied operation', async () => {
    render(
      <PendingOperationCard
        pendingOperation={makePendingOperation()}
        onConfirmExecute={vi.fn().mockResolvedValue({
          ok: true,
          response: makeExecutionResponse('Denied'),
        })}
        onPrepareStepUp={vi.fn()}
        onVerifyStepUp={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))

    await waitFor(() => {
      expect(screen.getByText('chat.sendError')).toBeInTheDocument()
    })

    expect(screen.queryByText('missing_scope:delete_habits')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.pendingOp.confirmed')).not.toBeInTheDocument()
  })

  it('shows friendly copy for known policy reasons instead of the raw code', async () => {
    render(
      <PendingOperationCard
        pendingOperation={makePendingOperation()}
        onConfirmExecute={vi.fn().mockResolvedValue({
          ok: true,
          response: makeExecutionResponse('Denied', {
            operation: {
              ...makeExecutionResponse('Denied').operation,
              policyReason: 'confirmation_required',
            },
          }),
        })}
        onPrepareStepUp={vi.fn()}
        onVerifyStepUp={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))

    await waitFor(() => {
      expect(
        screen.getByText('chat.pendingOp.errors.confirmation_required'),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('confirmation_required')).not.toBeInTheDocument()
  })

  it('localizes the capability title for confirmation-gated capabilities', () => {
    render(
      <PendingOperationCard
        pendingOperation={makePendingOperation({ capabilityId: 'habits.bulk.write' })}
        onConfirmExecute={vi.fn()}
        onPrepareStepUp={vi.fn()}
        onVerifyStepUp={vi.fn()}
      />,
    )

    expect(
      screen.getByText('chat.pendingOp.capability.habits-bulk-write'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Delete habit')).not.toBeInTheDocument()
  })

  it('dismisses the card without calling the mutation when Cancel is clicked', () => {
    const onConfirmExecute = vi.fn()
    render(
      <PendingOperationCard
        pendingOperation={makePendingOperation()}
        onConfirmExecute={onConfirmExecute}
        onPrepareStepUp={vi.fn()}
        onVerifyStepUp={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    fireEvent.transitionEnd(screen.getByTestId('pending-op-card'), { propertyName: 'opacity' })

    expect(onConfirmExecute).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pending-op-card')).not.toBeInTheDocument()
  })

  it('shows an error instead of success when step-up verification returns a failed operation', async () => {
    render(
      <PendingOperationCard
        pendingOperation={makePendingOperation({
          confirmationRequirement: 'StepUp',
          riskClass: 'High',
        })}
        onConfirmExecute={vi.fn()}
        onPrepareStepUp={vi.fn().mockResolvedValue({
          ok: true,
          challengeId: 'challenge-1',
          confirmationToken: 'confirm-token',
        })}
        onVerifyStepUp={vi.fn().mockResolvedValue({
          ok: true,
          response: makeExecutionResponse('Failed', {
            operation: {
              ...makeExecutionResponse('Failed').operation,
              policyReason: 'verification_failed',
            },
          }),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'auth.sendCode' }))
    await screen.findByPlaceholderText('common.codePlaceholder')

    fireEvent.change(screen.getByPlaceholderText('common.codePlaceholder'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.verify' }))

    await waitFor(() => {
      expect(screen.getByText('chat.sendError')).toBeInTheDocument()
    })

    expect(screen.queryByText('verification_failed')).not.toBeInTheDocument()
  })
})
