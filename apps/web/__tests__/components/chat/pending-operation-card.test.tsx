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
      expect(screen.getByText('missing_scope:delete_habits')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Delete Meditation habit')).toHaveLength(1)
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
    await screen.findByPlaceholderText('123456')

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.verify' }))

    await waitFor(() => {
      expect(screen.getByText('verification_failed')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Delete Meditation habit')).toHaveLength(1)
  })
})
