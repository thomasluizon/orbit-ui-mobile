import { describe, expect, it } from 'vitest'
import { pendingOperationExecutionPatch } from '../chat/pending-operation-message-state'
import { getPendingOperationExecutionCanRetry, getPendingOperationExecutionStatus, getPendingOperationItemResults } from '../hooks/pending-operation-card-core'
import { makeBulkCreateExecutionResponse } from '../test-support/pending-operation-preview-fixtures'

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
})
