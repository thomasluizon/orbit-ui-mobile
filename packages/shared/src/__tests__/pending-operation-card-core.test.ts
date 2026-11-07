import { describe, expect, it } from 'vitest'
import { pendingOperationExecutionPatch } from '../chat/pending-operation-message-state'
import { getPendingOperationExecutionCanRetry, getPendingOperationExecutionStatus, getPendingOperationItemResults, getPendingOperationPartialMutation } from '../hooks/pending-operation-card-core'
import { makeBulkCreateExecutionResponse, makeBulkUpdateExecutionResponse } from '../test-support/pending-operation-preview-fixtures'
import { COMPACT_FAILED_INDEXES, makeCompactBulkCreateExecution } from '../test-support/conversation-fixtures'
import { bulkCreateResponseSchema } from '../types/habit'

describe('producer batch outcomes', () => {
  it('retains retry for a rolled-back creation in the message state', () => {
    const response = makeBulkCreateExecutionResponse()
    expect(pendingOperationExecutionPatch({ ok: true, response })).toEqual({
      status: 'failed', canRetry: true, completedOperation: response.operation,
    })
    expect(getPendingOperationItemResults(response.operation)).toBeUndefined()
  })

  it.each([
    { statuses: ['Success', 'Success'] as const, status: 'done' },
    { statuses: ['Success', 'Failed'] as const, status: 'failed' },
    { statuses: ['Failed', 'Failed'] as const, status: 'failed' },
  ])('keeps completed item results $statuses without replaying creation', ({ statuses, status }) => {
    const response = makeBulkCreateExecutionResponse(statuses)
    const patch = pendingOperationExecutionPatch({ ok: true, response })
    expect(patch).toEqual({ status, canRetry: false, completedOperation: response.operation })
    expect(getPendingOperationItemResults(patch.completedOperation)).toMatchObject(
      statuses.map((itemStatus, index) => ({ index, status: itemStatus })),
    )
  })

  it.each(['Denied', 'UnsupportedByPolicy', 'PendingConfirmation', 'Succeeded'] as const)('does not offer execution retry for %s', (status) => {
    const response = makeBulkCreateExecutionResponse()
    response.operation.status = status
    expect(getPendingOperationExecutionCanRetry({ ok: true, response })).toBe(false)
  })

  it('does not infer rollback from a failure in another tool', () => {
    const response = makeBulkCreateExecutionResponse()
    response.operation.sourceName = 'bulk_update_habits'
    expect(getPendingOperationExecutionCanRetry({ ok: true, response })).toBe(false)
  })

  it('does not infer item outcomes or replay safety from an invalid payload', () => {
    const response = makeBulkCreateExecutionResponse()
    response.operation.payload = { results: [{ index: 0, status: 'unknown' }] }
    expect(getPendingOperationItemResults(response.operation)).toBeUndefined()
    expect(getPendingOperationExecutionCanRetry({ ok: true, response })).toBe(false)
    expect(getPendingOperationExecutionStatus({ ok: true, response })).toBe('failed')
  })

  it('retains the existing retry on a transport failure', () => {
    expect(pendingOperationExecutionPatch({ ok: false, error: 'Network failure' })).toMatchObject({ status: 'failed', canRetry: true })
  })

  it('reads each item of the compact stored bulk result', () => {
    const operation = makeCompactBulkCreateExecution()
    expect(bulkCreateResponseSchema.safeParse(operation.payload).success).toBe(true)
    expect(getPendingOperationItemResults(operation)?.filter(item => item.status === 'Failed').map(item => item.index)).toEqual(COMPACT_FAILED_INDEXES)
    expect(pendingOperationExecutionPatch({ ok: true, response: { operation } })).toMatchObject({ status: 'failed', canRetry: false })
  })
})

describe('partial bulk mutations', () => {
  it.each(['bulk_update_habits', 'bulk_update_habit_emojis', 'bulk_reschedule_habits', 'bulk_log_habits', 'bulk_skip_habits', 'bulk_delete_habits'])('does not report a partial %s as done', sourceName => {
    const response = makeBulkUpdateExecutionResponse(2, 5, sourceName)
    expect(getPendingOperationExecutionStatus({ ok: true, response })).toBe('failed')
    expect(getPendingOperationExecutionCanRetry({ ok: true, response })).toBe(false)
    expect(getPendingOperationPartialMutation(response.operation)).toEqual({ partial: true, applied_count: 2, total_matched: 5 })
  })

  it.each(['bulk_update_habits', 'bulk_update_habit_emojis'])('still reports a complete %s as done', sourceName => {
    const response = makeBulkUpdateExecutionResponse(5, 5, sourceName)
    expect(getPendingOperationExecutionStatus({ ok: true, response })).toBe('done')
    expect(getPendingOperationPartialMutation(response.operation)).toBeUndefined()
  })
})
