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
  BlockFrame: ({ title, items, actions, irreversibleLabel, confirmNote }: BlockFrameProps) => <section>
    <h2>{title}</h2>
    {items.map((item) => <div key={item.id}><span>{item.label}</span><span>{item.meta}</span><span>{item.status}</span>{item.irreversible ? <span>{irreversibleLabel}</span> : null}</div>)}
    {items.some((item) => item.irreversible) ? <span>{confirmNote}</span> : null}
    {actions}
  </section>,
}))

describe('OperationOutcomes on web', () => {

  it.each(['Low', 'Destructive', 'High'] as const)('keeps %s internal risk out of terminal outcome treatment', (riskClass) => {
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [
      { ...makeAgentOperationResult('Failed', 1), riskClass },
      { ...makeAgentOperationResult('Denied', 2), riskClass },
      { ...makeAgentOperationResult('UnsupportedByPolicy', 3), riskClass },
    ] })).outcomes
    render(<OperationOutcomes outcomes={outcomes} />)
    expect(screen.queryByText('chat.operation.irreversible')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.operation.confirmNote')).not.toBeInTheDocument()
    expect(screen.getByText('chat.operation.outcome.Failed')).toBeInTheDocument()
  })

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
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full operation target %s', (name) => {
    const operation = { ...makeAgentOperationResult('Failed', 2), targetName: name }
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes
    render(<OperationOutcomes outcomes={outcomes} />)
    const disclosure = screen.getByRole('button', { name, expanded: false })
    const title = disclosure.closest('[data-personal-text-action]')!.querySelector('[data-personal-text]')!
    expect(title).toHaveAttribute('aria-label', name)
    expect(title).toHaveStyle({ whiteSpace: name.includes(' ') ? 'normal' : 'nowrap', wordBreak: 'normal' })
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name, expanded: true })).toBeInTheDocument()
    expect(document.querySelector('[data-personal-text-expanded]')).not.toBeNull()
  })

})
