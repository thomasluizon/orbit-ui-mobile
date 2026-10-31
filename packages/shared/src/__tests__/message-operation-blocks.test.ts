import { describe, expect, it } from 'vitest'
import { selectMessageOperationBlocks } from '../chat/message-operation-blocks'
import { deniedBulkCreateReplyFixture, agentPolicyDenialFixture, failedReadOperationFixture, makeActionResult, makeAgentOperationResult, makeHeldHabitMessage } from '../test-support/chat-fixtures'
import { agentOperationResultSchema } from '../types/ai'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'

describe('read operation failures', () => {
  it.each(['read', 'write'])('preserves access=%s at the response boundary', access => {
    expect(agentOperationResultSchema.parse({ ...failedReadOperationFixture, access })).toMatchObject({ access })
  })

  it.each(['Failed', 'Denied', 'UnsupportedByPolicy'] as const)('omits a parsed %s read and its matching policy denial', status => {
    const operation = agentOperationResultSchema.parse({ ...failedReadOperationFixture, status })
    const message = makeHeldHabitMessage({ pendingOperations: [], operations: [operation], policyDenials: status === 'Failed' ? [] : [{
      operationId: operation.operationId, sourceName: operation.sourceName, riskClass: operation.riskClass,
      confirmationRequirement: operation.confirmationRequirement, reason: 'unsupported_by_policy',
    }] })
    expect(selectMessageOperationBlocks(message)).toEqual({ actions: [], outcomes: [] })
  })

  it.each([en, pt])('retains the localized answer with only the independent write outcome', messages => {
    const message = makeHeldHabitMessage({ pendingOperations: [], content: messages.chat.toolResult.toolFailure, operations: [
      agentOperationResultSchema.parse(failedReadOperationFixture),
      agentOperationResultSchema.parse({ ...failedReadOperationFixture, access: 'write', operationId: 'create_habit', sourceName: 'create_habit', targetName: 'Water' }),
    ] })
    expect(selectMessageOperationBlocks(message).outcomes).toMatchObject([{ source: 'create_habit', target: 'Water', status: 'Failed' }])
    expect(selectMessageOperationBlocks(message).outcomes).toHaveLength(1)
    expect(message.content).toBe(messages.chat.toolResult.toolFailure)
  })

  it.each(['write', undefined])('retains failure behavior for access=%s', access => {
    const operation = agentOperationResultSchema.parse({ ...failedReadOperationFixture, access, sourceName: 'CreateHabit' })
    expect(selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes).toMatchObject([{ status: 'Failed' }])
  })

  it('does not classify by the source name or low risk alone', () => {
    const operation = agentOperationResultSchema.parse({ ...failedReadOperationFixture, access: undefined, targetName: 'Week' })
    expect(selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes).toHaveLength(1)
  })

  it('omits a read even when its source has a write label and target', () => {
    const operation = agentOperationResultSchema.parse({ ...failedReadOperationFixture, sourceName: 'CreateHabit', targetName: 'Week' })
    expect(selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes).toHaveLength(0)
  })

  it('retains a tag write without a target', () => {
    const operation = agentOperationResultSchema.parse({ ...failedReadOperationFixture, access: 'write', sourceName: 'assign_tags' })
    expect(selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes).toMatchObject([{ source: 'assign_tags', status: 'Failed' }])
  })
})

describe('one block per write', () => {
  it('shows the latest outcome once for repeated operation identities', () => {
    const operation = { ...makeAgentOperationResult('Denied', 1), pendingOperationId: '11111111-1111-4111-8111-111111111111' }
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [], operations: [operation, { ...operation, status: 'Failed' }] })
    expect(selectMessageOperationBlocks(message).outcomes).toMatchObject([{ id: operation.pendingOperationId, status: 'Failed' }])
    expect(selectMessageOperationBlocks(message).outcomes).toHaveLength(1)
  })

  it.each([true, false])('retains an independent failure before a same-tool success with pending identity=%s', identified => {
    const failure = { ...makeAgentOperationResult('Failed', 1), operationId: 'create_habit',
      pendingOperationId: identified ? '11111111-1111-4111-8111-111111111111' : null }
    const success = { ...makeAgentOperationResult('Succeeded', 2), operationId: 'create_habit',
      pendingOperationId: identified ? '22222222-2222-4222-8222-222222222222' : null }
    const message = makeHeldHabitMessage({ pendingOperations: [], actions: [], operations: [failure, success] })
    expect(selectMessageOperationBlocks(message).outcomes).toMatchObject([{ status: 'Failed', target: 'Habit 1' }])
  })

  it('retains two same-tool failures as separate visible outcomes', () => {
    const operations = [1, 2].map(index => ({ ...makeAgentOperationResult('Failed', index), operationId: 'create_habit' }))
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], actions: [], operations })).outcomes
    expect(outcomes.map(outcome => outcome.target)).toEqual(['Habit 1', 'Habit 2'])
    expect(new Set(outcomes.map(outcome => outcome.id)).size).toBe(2)
  })
  it('keeps only the preview for a pending write', () => {
    expect(selectMessageOperationBlocks(makeHeldHabitMessage())).toEqual({ actions: [], outcomes: [] })
  })

  it('keeps a separate result when only one same-type write is pending', () => {
    const message = makeHeldHabitMessage({
      operations: [{ ...makeAgentOperationResult('PendingConfirmation', 1), pendingOperationId: 'held-habit' }],
      actions: [
        makeActionResult({ type: 'CreateHabit', status: 'Success', entityName: 'Beber água' }),
        makeActionResult({ type: 'CreateHabit', status: 'Success', entityName: 'Meditar' }),
      ],
    })
    expect(selectMessageOperationBlocks(message).actions).toMatchObject([{ entityName: 'Meditar' }])
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

it('retains the denied bulk create from the offer replay without a target or policy denial', () => {
  expect(selectMessageOperationBlocks(deniedBulkCreateReplyFixture).outcomes).toMatchObject([
    { source: 'bulk_create_habits', status: 'Denied', policyReason: 'invalid_offer', target: null },
  ])
})

it.each(['write', undefined])('retains an unknown source without a target for access=%s', access => {
  const operation = agentOperationResultSchema.parse({ ...deniedBulkCreateReplyFixture.operations![0]!, sourceName: 'future_write', access })
  expect(selectMessageOperationBlocks({ ...deniedBulkCreateReplyFixture, operations: [operation] }).outcomes).toMatchObject([
    { source: 'future_write', status: 'Denied', target: null },
  ])
})
