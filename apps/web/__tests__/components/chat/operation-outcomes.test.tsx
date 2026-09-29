import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import {
  agentPolicyDenialFixture as denial,
  makeAgentOperationResult,
} from '@orbit/shared/test-support/chat-fixtures'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'
import { selectMessageOperationBlocks } from '@orbit/shared/chat'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'

const push = vi.fn()
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: ({ title, items, actions }: BlockFrameProps) => <section>
    <h2>{title}</h2>
    {items.map((item) => <div key={item.id}><span>{item.label}</span><span>{item.meta}</span><span>{item.status}</span></div>)}
    {actions}
  </section>,
}))

describe('OperationOutcomes on web', () => {
  beforeEach(() => push.mockReset())

  it('renders localized typed outcomes and keeps policy recovery on Profile', () => {
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [
      makeAgentOperationResult('Succeeded', 1),
      makeAgentOperationResult('Failed', 2),
      makeAgentOperationResult('Denied', 3),
      makeAgentOperationResult('PendingConfirmation', 4),
    ], policyDenials: [denial] })).outcomes
    render(<OperationOutcomes outcomes={outcomes} />)

    for (const status of ['Failed', 'Denied', 'UnsupportedByPolicy']) {
      expect(screen.getByText(`chat.operation.outcome.${status}`)).toBeInTheDocument()
      expect(screen.getByText(`chat.operation.status.${status}`)).toBeInTheDocument()
    }
    expect(screen.queryByText('chat.operation.outcome.Succeeded')).not.toBeInTheDocument()
    expect(screen.queryByText('DeleteAccount')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.operation.openProfile' }))
    expect(push).toHaveBeenCalledWith('/profile')
  })

  it('renders one policy outcome when the API returns a denial twice', () => {
    const deniedOperation = { ...makeAgentOperationResult('Denied', 1), operationId: denial.operationId }
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [deniedOperation], policyDenials: [denial] })).outcomes
    render(<OperationOutcomes outcomes={outcomes} />)

    expect(screen.getAllByText('chat.operation.outcome.UnsupportedByPolicy')).toHaveLength(1)
    expect(screen.getAllByText('chat.operation.status.UnsupportedByPolicy')).toHaveLength(1)
  })
})
