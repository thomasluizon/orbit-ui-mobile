import { describe, expect, it } from 'vitest'
import { selectMessageOperationBlocks } from '../chat/message-operation-blocks'
import { agentPolicyDenialFixture, makeActionResult, makeAgentOperationResult, makeHeldHabitMessage } from '../test-support/chat-fixtures'

describe('one block per write', () => {
  it('keeps only the preview for a pending write', () => {
    expect(selectMessageOperationBlocks(makeHeldHabitMessage())).toEqual({ actions: [], outcomes: [] })
  })

  it('keeps a legacy success action and hides its succeeded outcome', () => {
    const message = makeHeldHabitMessage({
      pendingOperations: [],
      actions: [makeActionResult({ type: 'CreateHabit', status: 'Success' })],
      operations: [makeAgentOperationResult('Succeeded', 1)],
    })
    const blocks = selectMessageOperationBlocks(message)
    expect(blocks.actions).toHaveLength(1)
    expect(blocks.outcomes).toHaveLength(0)
  })

  it('hides succeeded read outcomes', () => {
    const message = makeHeldHabitMessage({ pendingOperations: [], operations: [makeAgentOperationResult('Succeeded', 1)] })
    expect(selectMessageOperationBlocks(message).outcomes).toHaveLength(0)
  })

  it('shows a failed action with no operation as one block', () => {
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({ type: 'CreateHabit', status: 'Failed' })] })
    expect(selectMessageOperationBlocks(message).actions).toHaveLength(1)
  })

  it('uses the policy outcome once when a denied write also has an action row', () => {
    const denial = { ...agentPolicyDenialFixture, operationId: 'operation-1', sourceName: 'CreateHabit' }
    const message = makeHeldHabitMessage({
      pendingOperations: [],
      actions: [makeActionResult({ type: 'CreateHabit', status: 'Failed' })],
      operations: [makeAgentOperationResult('Denied', 1)],
      policyDenials: [denial],
    })
    const blocks = selectMessageOperationBlocks(message)
    expect(blocks.actions).toHaveLength(0)
    expect(blocks.outcomes).toMatchObject([{ status: 'UnsupportedByPolicy' }])
  })
})
